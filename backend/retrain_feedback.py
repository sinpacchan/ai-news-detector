import os
import time
import pandas as pd
from transformers import BertTokenizer, BertForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
import torch
import requests
import hashlib
import shutil

# === Config ===

AI_MODEL_DIR = "./model_ai"
FAKE_MODEL_DIR = "./model_fake"

FEEDBACK_AI = "./feedback_ai.tsv"
FEEDBACK_FAKE = "./feedback_fake.tsv"

PROCESSED_SUFFIX = ".processed"

MIN_REPORTS_THRESHOLD = 5  # retrain only if text has at least this many reports

RELOAD_ENDPOINT = "http://localhost:5000/reload-models"

# === Helper functions ===

def sha256(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def count_reports(df):
    # Count occurrences of identical texts (hash by text for safety)
    df['text_hash'] = df['text'].apply(sha256)
    counts = df['text_hash'].value_counts()
    return counts

def filter_enough_reports(df, min_reports):
    counts = count_reports(df)
    # Keep only rows where text_hash has >= min_reports
    good_hashes = set(counts[counts >= min_reports].index)
    df['text_hash'] = df['text'].apply(sha256)
    filtered = df[df['text_hash'].isin(good_hashes)].drop(columns=['text_hash'])
    return filtered

def fine_tune_model(model_dir, feedback_file, output_dir, min_reports):
    if not os.path.exists(feedback_file):
        print(f"No feedback file {feedback_file}, skipping.")
        return False

    # Load feedback data
    df = pd.read_csv(feedback_file, sep="\t", header=None, names=["text", "label"])
    if len(df) == 0:
        print(f"No feedback data in {feedback_file}, skipping.")
        return False

    # Filter only texts with enough reports
    df_filtered = filter_enough_reports(df, min_reports)
    if len(df_filtered) == 0:
        print(f"No texts with ≥{min_reports} reports in {feedback_file}, skipping.")
        return False

    print(f"Fine-tuning model from {model_dir} on {len(df_filtered)} samples (filtered)...")

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

def main_loop():
    while True:
        print("⏰ Checking for new feedback...")

        ai_updated = fine_tune_model(AI_MODEL_DIR, FEEDBACK_AI, AI_MODEL_DIR, MIN_REPORTS_THRESHOLD)
        fake_updated = fine_tune_model(FAKE_MODEL_DIR, FEEDBACK_FAKE, FAKE_MODEL_DIR, MIN_REPORTS_THRESHOLD)

        if ai_updated or fake_updated:
            notify_reload()
            # Move processed files away so they're not retrained again
            if os.path.exists(FEEDBACK_AI):
                shutil.move(FEEDBACK_AI, FEEDBACK_AI + PROCESSED_SUFFIX)
            if os.path.exists(FEEDBACK_FAKE):
                shutil.move(FEEDBACK_FAKE, FEEDBACK_FAKE + PROCESSED_SUFFIX)
        else:
            print("No model updates needed.")

        # Sleep 10 minutes
        time.sleep(600)

if __name__ == "__main__":
    main_loop()