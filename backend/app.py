import gradio as gr
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import datetime

# Model names
MODEL_ID_AI = "lvulpecula/ai-detector-ai"
MODEL_ID_FAKE = "lvulpecula/ai-detector-fake"

# Thresholds
THRESHOLD_LOGIT_DIFF_AI = 1.5
THRESHOLD_LOGIT_DIFF_FAKE = 1.5
UNCERTAIN_MARGIN = 0.5

# Load models and tokenizers
tokenizer_ai = AutoTokenizer.from_pretrained(MODEL_ID_AI)
model_ai = AutoModelForSequenceClassification.from_pretrained(MODEL_ID_AI)

tokenizer_fake = AutoTokenizer.from_pretrained(MODEL_ID_FAKE)
model_fake = AutoModelForSequenceClassification.from_pretrained(MODEL_ID_FAKE)

def get_confidence(logits, positive_class=1):
    probs = torch.softmax(logits, dim=0)
    return probs[positive_class].item()

def predict(text):
    text = text.strip()

    if not text:
        return {"error": "Empty input text."}
    if len(text) < 30:
        return {"error": "Text too short to analyze reliably."}

    inputs_ai = tokenizer_ai(text, return_tensors="pt", truncation=True, padding=True, max_length=512)
    inputs_fake = tokenizer_fake(text, return_tensors="pt", truncation=True, padding=True, max_length=512)

    with torch.no_grad():
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

    return {
        "ai_label": ai_label,
        "confidence_ai": round(confidence_ai * 100, 2) if confidence_ai is not None else "N/A",
        "ai_logit_margin": round(ai_diff.item(), 3),
        "is_ai_generated": is_ai,
        "fake_label": fake_label,
        "confidence_fake": round(confidence_fake * 100, 2) if confidence_fake is not None else "N/A",
        "fake_logit_margin": round(fake_diff.item(), 3),
        "is_fake": is_fake
    }

# Gradio interface
interface = gr.Interface(
    fn=predict,
    inputs=gr.Textbox(label="Article Text", lines=10, placeholder="Paste article text here..."),
    outputs="json",
    title="AI News Detector",
    description="This tool predicts whether a news article is AI-generated and/or fake.",
    allow_flagging="never"
)

interface.launch()