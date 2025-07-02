from flask import Flask, request, jsonify
from transformers import BertTokenizer, BertForSequenceClassification
import torch
from flask_cors import CORS
import os
import json
import datetime

app = Flask(__name__)
CORS(app)

# Model paths
MODEL_PATH_AI = "./model_ai"
MODEL_PATH_FAKE = "./model_fake"

def load_models():
    global tokenizer_ai, tokenizer_fake, model_ai, model_fake
    tokenizer_ai = BertTokenizer.from_pretrained(MODEL_PATH_AI)
    tokenizer_fake = BertTokenizer.from_pretrained(MODEL_PATH_FAKE)
    model_ai = BertForSequenceClassification.from_pretrained(MODEL_PATH_AI)
    model_fake = BertForSequenceClassification.from_pretrained(MODEL_PATH_FAKE)

load_models()

# Thresholds
THRESHOLD_LOGIT_DIFF_AI = 1.5
THRESHOLD_LOGIT_DIFF_FAKE = 1.5
UNCERTAIN_MARGIN = 0.5

def get_confidence(logits, positive_class=1):
    probs = torch.softmax(logits, dim=0)
    return probs[positive_class].item()

@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json()
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "Empty input text."}), 400
    if len(text) < 30:
        return jsonify({"error": "Text too short to analyze reliably."}), 400

    inputs_ai = tokenizer_ai(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    inputs_fake = tokenizer_fake(text, return_tensors="pt", truncation=True, padding=True, max_length=512)

    with torch.no_grad():
        # AI detection
        ai_logits = model_ai(**inputs_ai).logits[0]
        ai_diff = ai_logits[1] - ai_logits[0]

        if ai_diff > THRESHOLD_LOGIT_DIFF_AI:
            ai_label = "🤖 AI-generated"
            confidence_ai = get_confidence(ai_logits, 1)
            is_ai = True
        elif abs(ai_diff) < UNCERTAIN_MARGIN:
            ai_label = "❓ Uncertain"
            confidence_ai = None
            is_ai = False
        else:
            ai_label = "👤 Human-written"
            confidence_ai = get_confidence(ai_logits, 0)
            is_ai = False

        # Fake news detection
        fake_logits = model_fake(**inputs_fake).logits[0]
        fake_diff = fake_logits[1] - fake_logits[0]

        if fake_diff > THRESHOLD_LOGIT_DIFF_FAKE:
            fake_label = "⚠️ Fake news"
            confidence_fake = get_confidence(fake_logits, 1)
            is_fake = True
        elif abs(fake_diff) < UNCERTAIN_MARGIN:
            fake_label = "❓ Uncertain"
            confidence_fake = None
            is_fake = False
        else:
            fake_label = "✅ True information"
            confidence_fake = get_confidence(fake_logits, 0)
            is_fake = False

    return jsonify({
        "ai_label": ai_label,
        "confidence_ai": round(confidence_ai * 100, 2) if confidence_ai is not None else "N/A",
        "ai_logit_margin": round(ai_diff.item(), 3),
        "is_ai_generated": is_ai,
        "fake_label": fake_label,
        "confidence_fake": round(confidence_fake * 100, 2) if confidence_fake is not None else "N/A",
        "fake_logit_margin": round(fake_diff.item(), 3),
        "is_fake": is_fake
    })

@app.route("/report", methods=["POST"])
def report_mistake():
    data = request.get_json()
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "Empty input text in feedback."}), 400

    feedback = {
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "text": text,
        "model_ai_label": data.get("model_ai_label"),
        "correct_ai_label": data.get("correct_ai_label"),
        "model_fake_label": data.get("model_fake_label"),
        "correct_fake_label": data.get("correct_fake_label")
    }

    os.makedirs("feedback_logs", exist_ok=True)
    filename = f"feedback_logs/report_{int(datetime.datetime.utcnow().timestamp() * 1000)}.json"

    try:
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(feedback, f, indent=2, ensure_ascii=False)
        return jsonify({"message": "✅ Feedback saved. Thank you!"}), 200
    except Exception as e:
        return jsonify({"error": f"Failed to save feedback: {str(e)}"}), 500

@app.route("/reload-models", methods=["POST"])
def reload_models():
    try:
        load_models()
        print("🔄 Models reloaded successfully.")
        return jsonify({"message": "Models reloaded successfully."}), 200
    except Exception as e:
        print(f"❌ Failed to reload models: {e}")
        return jsonify({"error": f"Failed to reload models: {e}"}), 500
    
@app.route('/')
def home():
    return "Hello from Render!"

if __name__ == "__main__":
    print("🚀 API running on http://localhost:5000")
    app.run(port=5000, debug=True)