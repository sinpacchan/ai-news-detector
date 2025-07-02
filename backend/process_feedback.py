import os
import json
import csv
import shutil
import time
import pandas as pd
from transformers import BertTokenizer, BertForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
import requests
import hashlib

# === Config ===

FEEDBACK_DIR = "feedback_logs"
PROCESSED_DIR = os.path.join(FEEDBACK_DIR, "processed")
os.makedirs(PROCESSED_DIR, exist_ok=True)

OUTPUT_FILE_AI = "feedback_ai.tsv"
OUTPUT_FILE_FAKE = "feedback_fake.tsv"

AI_MODEL_DIR = "./model_ai"
FAKE_MODEL_DIR = "./model_fake"

MIN_REPORTS_THRESHOLD = 5

RELOAD_ENDPOINT = "http://localhost:5000/reload-models"

PROCESSED_SUFFIX = ".processed"

# === Process feedback JSON logs into TSV datasets ===

def process_feedback():
    with open(OUTPUT_FILE_AI, "w", encoding="utf-8", newline="") as out_ai, \
         open(OUTPUT_FILE_FAKE, "w", encoding="utf-8", newline="") as out_fake:

        writer_ai = csv.writer(out_ai, delimiter="\t")
        writer_fake = csv.writer(out_fake, delimiter="\t")

        for filename in os.listdir(FEEDBACK_DIR):
            if filename.endswith(".json"):
                file_path = os.path.join(FEEDBACK_DIR, filename)
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        entry = json.load(f)
                except Exception as e:
                    print(f"Failed to load {filename}: {e}")
                    continue

                text = entry.get("text", "").strip()
                if not text:
                    continue

                correct_ai = entry.get("correct_ai_label")
                if correct_ai in ["🤖 AI-generated", "👤 Human-written"]:
                    ai_label = 1 if "AI" in correct_ai else 0
                    writer_ai.writerow([text, ai_label])

                correct_fake = entry.get("correct_fake_label")
                if correct_fake in ["⚠️ Fake news", "✅ True information"]:
                    fake_label = 1 if "Fake" in correct_fake else 0
                    writer_fake.writerow([text, fake_label])

                shutil.move(file_path, os.path.join(PROCESSED_DIR, filename))

    print(f"✅ Processed feedback saved to {OUTPUT_FILE_AI} and {OUTPUT_FILE_FAKE}")

# === Helper functions for retraining ===

def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def count_reports(df):
    df['text_hash'] = df['text'].apply(sha256)
    counts = df['text_hash'].value_counts()
    return counts

def filter_enough_reports(df, min_reports):
    counts = count_reports(df)
    good_hashes = set(counts[counts >= min_reports].index)
    df['text_hash'] = df['text'].apply(sha256)
    filtered = df[df['text_hash'].isin(good_hashes)].drop(columns=['text_hash'])
    return filtered

def fine_tune_model(model_dir, feedback_file, output_dir, min_reports):
    if not os.path.exists(feedback_file):
        print(f"No feedback file {feedback_file}, skipping.")
        return False

    df = pd.read_csv(feedback_file, sep="\t", header=None, names=["text", "label"])
    if len(df) == 0:
        print(f"No feedback data in {feedback_file}, skipping.")
        return False

    df_filtered = filter_enough_reports(df, min_reports)
    if len(df_filtered) == 0:
        print(f"No texts with ≥{min_reports} reports in {feedback_file}, skipping.")
        return False

    print(f"Fine-tuning model from {model_dir} on {len(df_filtered)} samples...")

    tokenizer = BertTokenizer.from_pretrained(model_dir)
    model = BertForSequenceClassification.from_pretrained(model_dir)

    ds = Dataset.from_pandas(df_filtered)

    def tokenize_fn(examples):
        return tokenizer(examples['text'], padding="max_length", truncation=True, max_length=512)

    ds = ds.map(tokenize_fn, batched=True)
    ds.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])

    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=2,
        per_device_train_batch_size=8,
        learning_rate=2e-5,
        logging_dir='./logs',
        logging_steps=10,
        save_strategy='epoch',
        evaluation_strategy='no',
        load_best_model_at_end=False,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=ds,
    )

    trainer.train()
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)

    print(f"Model fine-tuned and saved to {output_dir}")
    return True

def notify_reload():
    try:
        response = requests.post(RELOAD_ENDPOINT)
        if response.ok:
            print("✅ Successfully notified app.py to reload models.")
        else:
            print(f"❌ Reload request failed with status code {response.status_code}")
    except Exception as e:
        print(f"❌ Error notifying reload endpoint: {e}")

# === Main loop ===

def main_loop():
    while True:
        print("⏰ Processing feedback and checking for new data...")

        process_feedback()

        ai_updated = fine_tune_model(AI_MODEL_DIR, OUTPUT_FILE_AI, AI_MODEL_DIR, MIN_REPORTS_THRESHOLD)
        fake_updated = fine_tune_model(FAKE_MODEL_DIR, OUTPUT_FILE_FAKE, FAKE_MODEL_DIR, MIN_REPORTS_THRESHOLD)

        if ai_updated or fake_updated:
            notify_reload()

            # Move processed TSV files so they are not reused again
            if os.path.exists(OUTPUT_FILE_AI):
                os.rename(OUTPUT_FILE_AI, OUTPUT_FILE_AI + PROCESSED_SUFFIX)
            if os.path.exists(OUTPUT_FILE_FAKE):
                os.rename(OUTPUT_FILE_FAKE, OUTPUT_FILE_FAKE + PROCESSED_SUFFIX)
        else:
            print("No model updates needed.")

        # Sleep 10 minutes (adjust as needed)
        time.sleep(600)

if __name__ == "__main__":
    main_loop()