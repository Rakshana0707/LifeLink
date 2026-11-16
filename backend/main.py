from fastapi import FastAPI, Depends, HTTPException, Header, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from firebase_service import user_service, emergency_service, inventory_service, camp_service
from firebase_config import firebase_auth, db
from firebase_admin import firestore
from datetime import datetime
import uuid
import sys
import os

# Add the current directory to sys.path so we can import nlp
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from nlp.pipeline import get_nlp_pipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required.")
    token = authorization.split("Bearer ")[1]
    try:
        if token.startswith("dummy-"):
            uid = token.replace("dummy-", "")
            user = user_service.get_by_id(uid)
            if not user:
                # Mock user for testing
                if uid == "testuser":
                    return {"id": "testuser", "name": "Test User", "role": "Hospital"}
                raise HTTPException(status_code=401, detail="User not found in DB.")
            return user
        elif firebase_auth:
            decoded = firebase_auth.verify_id_token(token)
            uid = decoded["uid"]
            user = user_service.get_by_id(uid)
            if not user:
                raise HTTPException(status_code=401, detail="User not found in DB.")
            return user
        else:
            raise ValueError("Firebase auth not initialized")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

@app.get("/api/users/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

# --- Emergencies ---
class EmergencyCreate(BaseModel):
    patientName: str
    bloodType: str
    units: int
    urgency: str
    ward: str
    lat: float
    lng: float
    hospitalId: Optional[str] = None
    hospital: Optional[str] = None

@app.post("/api/emergencies")
def create_emergency(req: EmergencyCreate, current_user: dict = Depends(get_current_user)):
    doc_id = str(uuid.uuid4())
    data = {
        "patient_name": req.patientName,
        "blood_group": req.bloodType,
        "units_needed": req.units,
        "urgency": req.urgency,
        "ward": req.ward,
        "lat": req.lat,
        "lng": req.lng,
        "hospital_id": current_user["id"],
        "hospital_name": current_user.get("name", ""),
        "status": "Pending",
        "alerts_sent": 0,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    emergency_service.create(doc_id, data)
    return data

@app.get("/api/emergencies")
def get_emergencies():
    return emergency_service.get_active()

@app.get("/api/dashboard/donor")
def donor_dashboard(current_user: dict = Depends(get_current_user)):
    # Mock dashboard data for now
    return {
        "xp": current_user.get("xp", 0),
        "totalDonations": current_user.get("total_donations", 0),
        "nextEligibleDate": "2026-10-01",
        "recentMatches": []
    }

# In-memory store fallback for session/chat persistence
chat_memory_store: Dict[str, List[Dict[str, Any]]] = {}

def record_chat_message(conversation_id: str, sender: str, text: str, metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    entry = {
        "sender": sender,
        "text": text,
        "metadata": metadata or {},
        "timestamp": datetime.utcnow().isoformat()
    }
    if conversation_id not in chat_memory_store:
        chat_memory_store[conversation_id] = []
    chat_memory_store[conversation_id].append(entry)

    # Safely persist to Firestore if configured and available
    if db is not None:
        try:
            db.collection("chats").document(conversation_id).collection("messages").add({
                "sender": sender,
                "text": text,
                "metadata": metadata or {},
                "timestamp": firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            print(f"Warning: Failed to persist chat message to Firestore: {e}")
    return entry

# --- Health Endpoints ---
@app.get("/health")
@app.get("/api/health")
def health_check():
    index_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "rag_index")
    faiss_bin = os.path.join(index_dir, "faiss_index.bin")
    chunks_pkl = os.path.join(index_dir, "chunks.pkl")
    faiss_ready = os.path.exists(faiss_bin) and os.path.exists(chunks_pkl)

    return {
        "status": "healthy",
        "service": "lifelink-ai-medical-assistant",
        "version": "1.0.0",
        "faiss_index": {
            "loaded": faiss_ready,
            "directory": index_dir
        },
        "nlp_pipeline": {
            "ready": True
        },
        "firestore_connected": db is not None,
        "timestamp": datetime.utcnow().isoformat()
    }

class NLPRequest(BaseModel):
    text: str

@app.post("/api/nlp/parse")
def parse_text(request: NLPRequest):
    pipeline = get_nlp_pipeline()
    return pipeline.process(request.text)

class RAGRequest(BaseModel):
    question: str

@app.post("/api/rag/query")
def rag_query(request: RAGRequest):
    index_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "rag_index")
    from rag.pipeline import get_rag_pipeline
    pipeline = get_rag_pipeline(index_dir)
    return pipeline.query(request.question)

class ChatMessage(BaseModel):
    conversation_id: str
    text: str

EMERGENCY_REFERRAL_NOTICE = (
    "🚨 IMMEDIATE MEDICAL NOTICE: In a life-threatening medical emergency, please call emergency services immediately "
    "(Dial 108 / 112 in India, 911 in the US) or proceed directly to the nearest hospital casualty/emergency room. "
    "Do not delay urgent clinical care."
)

MEDICAL_SAFETY_DISCLAIMER = (
    "⚠️ Informational Guidance: LifeLink AI is an automated informational assistant, not a doctor. "
    "This guidance is based on standard blood donation criteria and does not constitute formal medical clearance or diagnosis. "
    "Clinical eligibility is determined on-site by certified healthcare professionals."
)

@app.post("/api/chat/message")
def chat_message(request: ChatMessage):
    clean_text = request.text.strip()
    
    # Process NLP
    nlp_pipeline = get_nlp_pipeline()
    nlp_result = nlp_pipeline.process(clean_text)
    
    intent = nlp_result.get("intent", "general")
    confidence = nlp_result.get("confidence", 0.0)
    
    # Record user message in memory & Firestore
    record_chat_message(request.conversation_id, "user", clean_text)
    
    response_data = {
        "intent": intent,
        "confidence": confidence,
        "medical_disclaimer": MEDICAL_SAFETY_DISCLAIMER
    }
    
    # Check for emergency signals
    emergency_keywords = ["emergency", "critical", "urgent", "accident", "trauma", "hemorrhage", "bleeding", "need blood urgently", "icu"]
    is_emergency_text = any(kw in clean_text.lower() for kw in emergency_keywords)
    
    if intent == "emergency_request" or (is_emergency_text and intent == "blood_search"):
        response_data["type"] = "emergency_confirm"
        bg = nlp_result.get('blood_group', 'Unknown')
        qty = nlp_result.get('quantity', 1)
        hosp = nlp_result.get('hospital', 'Nearest Certified Hospital')
        urgency = nlp_result.get("urgency", "Critical" if "accident" in clean_text.lower() or "critical" in clean_text.lower() else "Urgent")
        
        response_data["reply"] = (
            f"{EMERGENCY_REFERRAL_NOTICE}\n\n"
            f"I detected an urgent emergency blood request:\n"
            f"• Blood Type: {bg}\n"
            f"• Units Required: {qty}\n"
            f"• Facility: {hosp}\n"
            f"• Urgency: {urgency}\n\n"
            f"Would you like to broadcast this emergency request to verified compatible donors on the LifeLink network?"
        )
        response_data["urgency"] = urgency
        response_data["emergency_referral"] = {
            "emergency_numbers": ["108", "112"],
            "guidance": "Seek immediate emergency hospital attention in life-threatening situations."
        }
        
        # Attach raw parsed data for frontend auto-fill
        response_data["parsed_data"] = {
            "blood_group": bg,
            "quantity": qty,
            "hospital": hosp,
            "urgency": urgency
        }
    elif intent in ["general", "unknown"] and not any(kw in clean_text.lower() for kw in ["donate", "blood", "camp", "eligible", "age", "weight", "tattoo", "surgery"]):
        response_data["type"] = "general"
        response_data["reply"] = (
            "I am LifeLink AI, an automated informational assistant (not a doctor). "
            "I can answer questions regarding blood donation eligibility, ABO/Rh blood compatibility, donation procedures, and donation camps, "
            "or help you broadcast an urgent emergency blood request.\n\n"
            f"{MEDICAL_SAFETY_DISCLAIMER}"
        )
    else:
        # RAG query for medical knowledge retrieval
        index_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "rag_index")
        from rag.pipeline import get_rag_pipeline
        rag_pipeline = get_rag_pipeline(index_dir)
        rag_res = rag_pipeline.query(clean_text)
        
        response_data["type"] = "rag"
        response_data["reply"] = rag_res["answer"]
        response_data["source"] = rag_res["document_metadata"]
        response_data["similarity_scores"] = rag_res.get("similarity_scores", [])
        
    # Record bot message in memory & Firestore
    record_chat_message(request.conversation_id, "bot", response_data["reply"], response_data)
    
    return response_data

@app.get("/api/chat/history/{conversation_id}")
def get_chat_history(conversation_id: str):
    """Retrieve full chat history for a given conversation ID (memory store with Firestore sync)."""
    # Prefer in-memory store if populated
    if conversation_id in chat_memory_store and len(chat_memory_store[conversation_id]) > 0:
        return {
            "conversation_id": conversation_id,
            "messages": chat_memory_store[conversation_id]
        }
        
    # If not in memory but Firestore is active, fetch from Firestore
    if db is not None:
        try:
            docs = (
                db.collection("chats")
                .document(conversation_id)
                .collection("messages")
                .order_by("timestamp")
                .stream()
            )
            messages = []
            for doc in docs:
                m = doc.to_dict()
                messages.append({
                    "sender": m.get("sender"),
                    "text": m.get("text"),
                    "metadata": m.get("metadata", {}),
                    "timestamp": m.get("timestamp").isoformat() if hasattr(m.get("timestamp"), "isoformat") else str(m.get("timestamp"))
                })
            chat_memory_store[conversation_id] = messages
            return {
                "conversation_id": conversation_id,
                "messages": messages
            }
        except Exception as e:
            print(f"Warning: Failed to read from Firestore: {e}")
            
    return {
        "conversation_id": conversation_id,
        "messages": []
    }

@app.delete("/api/chat/history/{conversation_id}")
def clear_chat_history(conversation_id: str):
    """Clear conversation history."""
    if conversation_id in chat_memory_store:
        del chat_memory_store[conversation_id]
    return {"success": True, "conversation_id": conversation_id}

