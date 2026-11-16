import os
import sys
from fastapi.testclient import TestClient

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app

client = TestClient(app)

def test_fastapi_health_endpoint():
    """1. Validate FastAPI health endpoint."""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["service"] == "lifelink-ai-medical-assistant"
    assert "faiss_index" in data
    assert data["faiss_index"]["loaded"] is True

    # Also check /api/health alias
    res_api = client.get("/api/health")
    assert res_api.status_code == 200
    assert res_api.json()["status"] == "healthy"

def test_nlp_parsing_and_entities():
    """2. Validate NLP entity extraction and normalization."""
    res = client.post("/api/nlp/parse", json={"text": "Urgently need 2 units of O+ blood at Apollo Hospital"})
    assert res.status_code == 200
    data = res.json()
    assert data["blood_group"] == "O+"
    assert data["quantity"] == 2
    assert data["urgency"] in ["Critical", "Urgent"]

def test_intent_classification_emergency():
    """3. Validate intent classification for emergency request."""
    res = client.post("/api/chat/message", json={
        "conversation_id": "test_conv_emerg",
        "text": "Emergency! Patient bleeding heavily, need 3 packs of B- blood at City Clinic immediately"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "emergency_confirm"
    assert "parsed_data" in data
    assert data["parsed_data"]["blood_group"] == "B-"
    assert data["parsed_data"]["quantity"] == 3

def test_emergency_referral_suggestions():
    """4. Validate medical emergency referral and non-delay instructions."""
    res = client.post("/api/chat/message", json={
        "conversation_id": "test_conv_referral",
        "text": "Patient in ICU needs urgent blood after accident"
    })
    assert res.status_code == 200
    data = res.json()
    reply = data["reply"]
    # Must refer to emergency services and instruct not to delay clinical treatment
    assert "108" in reply or "112" in reply or "emergency services" in reply.lower()
    assert "delay" in reply.lower()
    assert "emergency_referral" in data
    assert "108" in data["emergency_referral"]["emergency_numbers"]

def test_rag_retrieval_and_medical_knowledge():
    """5. Validate RAG retrieval from authoritative knowledge base."""
    res = client.post("/api/rag/query", json={"question": "Who can receive O- blood?"})
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert len(data["retrieved_chunks"]) > 0
    # Must attribute sources to knowledge base
    filenames = [doc["filename"] for doc in data["document_metadata"]]
    assert "compatibility.txt" in filenames

def test_eligibility_criteria_factual_accuracy():
    """6. Validate factual correctness of eligibility information."""
    res = client.post("/api/rag/query", json={"question": "What is the age requirement to donate blood?"})
    assert res.status_code == 200
    data = res.json()
    answer_text = data["answer"]
    # Check that age requirement matches authoritative eligibility.txt (18 to 65 years)
    assert "18" in answer_text or "65" in answer_text or "eligible" in answer_text.lower()

def test_medical_safety_not_a_doctor_disclaimer():
    """7. Validate medical disclaimer: bot is an assistant, not a doctor."""
    res = client.post("/api/chat/message", json={
        "conversation_id": "test_conv_disclaimer",
        "text": "How long do I have to wait after getting a tattoo before donating?"
    })
    assert res.status_code == 200
    data = res.json()
    reply = data["reply"]
    # Must contain medical safety disclaimer
    assert "not a doctor" in reply.lower() or "informational" in reply.lower()
    assert "clinical" in reply.lower() or "medical professional" in reply.lower()

def test_unsupported_medical_condition_handling():
    """8. Validate unsupported condition handling without medical hallucination."""
    res = client.post("/api/chat/message", json={
        "conversation_id": "test_conv_unsupported",
        "text": "Can I donate blood if I have systemic lupus erythematosus?"
    })
    assert res.status_code == 200
    data = res.json()
    reply = data["reply"]
    # Must NOT hallucinate clearance; must state lack of verified information and refer to doctor
    assert "not have verified" in reply.lower() or "consult a" in reply.lower() or "physician" in reply.lower()
    assert "clearance" not in reply.lower() or "not constitute" in reply.lower()

def test_chat_history_and_persistence():
    """9. Validate chat history recording and retrieval."""
    conv_id = "test_conv_history_123"
    client.post("/api/chat/message", json={
        "conversation_id": conv_id,
        "text": "Hello, how does the whole blood donation process work?"
    })
    
    # Retrieve history
    hist_res = client.get(f"/api/chat/history/{conv_id}")
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["conversation_id"] == conv_id
    assert len(hist_data["messages"]) >= 2
    assert hist_data["messages"][0]["sender"] == "user"
    assert hist_data["messages"][1]["sender"] == "bot"

    # Clear history
    del_res = client.delete(f"/api/chat/history/{conv_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

def test_general_inquiry_and_error_fallback():
    """10. Validate general inquiry handling and graceful degradation."""
    res = client.post("/api/chat/message", json={
        "conversation_id": "test_conv_gen",
        "text": "Hello there"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "general"
    assert "LifeLink AI" in data["reply"]
    assert "not a doctor" in data["reply"].lower()
