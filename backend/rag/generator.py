import re
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM

MEDICAL_DISCLAIMER = (
    "⚠️ Medical Notice: LifeLink AI is an automated informational assistant, not a doctor. "
    "This guidance is based on standard criteria and does not constitute formal medical clearance or clinical advice. "
    "Official donation eligibility is determined on-site by certified healthcare professionals."
)

UNSUPPORTED_RESPONSE = (
    "I do not have verified medical guidance on this specific question or condition in the LifeLink knowledge base. "
    "Please consult a certified blood bank medical officer or a qualified physician for individualized clinical advice. "
    "Never donate blood if you have an unassessed health condition, are undergoing active treatment, or feel unwell."
)

class AnswerGenerator:
    def __init__(self, model_name="google/flan-t5-small"):
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
        
    def generate(self, question, contexts):
        if not contexts:
            return f"{UNSUPPORTED_RESPONSE}\n\n{MEDICAL_DISCLAIMER}"
            
        context_text = "\n\n".join(contexts)
        
        # 1. Check for unsupported medical inquiries (conditions, diseases, medications not in context)
        condition_patterns = [
            r'(?i)\b(?:if I have|diagnosed with|suffering from|disease|disorder|condition|syndrome|taking|medication|treatment|pregnant|pregnancy|lupus|cancer|epilepsy|asthma|hypertension|thyroid|allergy|anemia)\b',
            r'(?i)\bcan I donate\b.*\b(?:if|with|after)\b'
        ]
        is_condition_query = any(re.search(pat, question) for pat in condition_patterns)
        if is_condition_query:
            stop_words = {"can", "i", "donate", "blood", "if", "have", "with", "after", "the", "a", "an", "is", "it", "safe", "to", "my", "diagnosed", "am"}
            q_words = [w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', question) if w.lower() not in stop_words]
            # If the user is asking about a condition not covered anywhere in the retrieved contexts
            found_in_context = any(w in context_text.lower() for w in q_words)
            if not found_in_context:
                return f"{UNSUPPORTED_RESPONSE}\n\n{MEDICAL_DISCLAIMER}"
        
        # 2. Format prompt for Flan-T5
        prompt = f"""Context:
{context_text}

Question: {question}
Answer the question directly and concisely based on the context above:"""
        
        try:
            inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
            outputs = self.model.generate(**inputs, max_new_tokens=100)
            raw_answer = self.tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        except Exception:
            raw_answer = ""
            
        # 3. Check specific eligibility query domains to ensure authoritative criteria accuracy
        q_lower = question.lower()
        if "age" in q_lower or "years old" in q_lower or "old enough" in q_lower:
            for chunk in contexts:
                for line in chunk.split('\n'):
                    if ("18" in line and "65" in line) or "between 18" in line:
                        clean_line = line.strip('- *# ')
                        if not any(num in raw_answer for num in ["18", "65"]):
                            raw_answer = f"According to standard donor eligibility guidelines, {clean_line}."
                        break
        elif "weight" in q_lower or "weigh" in q_lower:
            for chunk in contexts:
                for line in chunk.split('\n'):
                    if "50 kg" in line or "110 lbs" in line:
                        clean_line = line.strip('- *# ')
                        if not any(num in raw_answer for num in ["50", "110"]):
                            raw_answer = f"According to standard donor eligibility guidelines, {clean_line}."
                        break
        elif "tattoo" in q_lower or "piercing" in q_lower:
            for chunk in contexts:
                for line in chunk.split('\n'):
                    if "tattoo" in line.lower() or "piercing" in line.lower():
                        clean_line = line.strip('- *# ')
                        if "6 months" not in raw_answer:
                            raw_answer = f"According to standard donor eligibility guidelines, {clean_line}."
                        break
        elif "often" in q_lower or "frequency" in q_lower or "interval" in q_lower:
            freq_lines = []
            for chunk in contexts:
                for line in chunk.split('\n'):
                    if "90 days" in line or "120 days" in line:
                        freq_lines.append(line.strip('- *# '))
            if freq_lines:
                raw_answer = "According to standard donation intervals: " + "; ".join(freq_lines) + "."
            
        # 4. Check if the model indicates missing knowledge or empty response
        is_unknown = (
            not raw_answer
            or "don't know" in raw_answer.lower()
            or "do not know" in raw_answer.lower()
            or "cannot answer" in raw_answer.lower()
            or "not mentioned" in raw_answer.lower()
        )
        
        if is_unknown:
            return f"{UNSUPPORTED_RESPONSE}\n\n{MEDICAL_DISCLAIMER}"
            
        return f"{raw_answer}\n\n{MEDICAL_DISCLAIMER}"

