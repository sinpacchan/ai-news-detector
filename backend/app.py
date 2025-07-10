from flask import Flask, request, jsonify
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from flask_cors import CORS
import torch

app = Flask(__name__)
CORS(app)  # Enable CORS so your Chrome extension can make requests

# Load models
MODEL_ID_AI = "lvulpecula/ai-detector-ai"
MODEL_ID_FAKE = "lvulpecula/ai-detector-fake"

tokenizer_ai = AutoTokenizer.from_pretrained(MODEL_ID_AI)
model_ai = AutoModelForSequenceClassification.from_pretrained(MODEL_ID_AI)

tokenizer_fake = AutoTokenizer.from_pretrained(MODEL_ID_FAKE)
model_fake = AutoModelForSequenceClassification.from_pretrained(MODEL_ID_FAKE)

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

    # AI Detection
    inputs_ai = tokenizer_ai(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    with torch.no_grad():
        ai_logits = model_ai(**inputs_ai).logits[0]
        ai_diff = ai_logits[1] - ai_logits[0]

    if ai_diff > 1.5:
        ai_label = "🤖 AI-generated"
        confidence_ai = get_confidence(ai_logits, 1)
    elif abs(ai_diff) < 0.5:
        ai_label = "❓ Uncertain"
        confidence_ai = None
    else:
        ai_label = "👤 Human-written"
        confidence_ai = get_confidence(ai_logits, 0)

    # Fake News Detection
    inputs_fake = tokenizer_fake(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    with torch.no_grad():
        fake_logits = model_fake(**inputs_fake).logits[0]
        fake_diff = fake_logits[1] - fake_logits[0]

    if fake_diff > 1.5:
        fake_label = "⚠️ Fake news"
        confidence_fake = get_confidence(fake_logits, 1)
    elif abs(fake_diff) < 0.5:
        fake_label = "❓ Uncertain"
        confidence_fake = None
    else:
        fake_label = "✅ True information"
        confidence_fake = get_confidence(fake_logits, 0)

    return jsonify({
        "ai_label": ai_label,
        "confidence_ai": round(confidence_ai * 100, 2) if confidence_ai is not None else "N/A",
        "fake_label": fake_label,
        "confidence_fake": round(confidence_fake * 100, 2) if confidence_fake is not None else "N/A"
    })

@app.route("/report", methods=["POST"])
def report():
    data = request.get_json()
    try:
        with open("reports.log", "a", encoding="utf-8") as f:
            f.write(str(data) + "\n")
        return jsonify({"message": "Report submitted. Thank you!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)