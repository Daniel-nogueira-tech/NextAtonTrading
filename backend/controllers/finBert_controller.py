from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from utils.crypto_news_api import query_archive, get_news_by_coin

model_name = "ProsusAI/finbert"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)


def get_sentiment_scores(texts, mode = 'real'):

    single = isinstance(texts, str)
    inputs = tokenizer(texts, return_tensors="pt", truncation=True, padding=True, max_length=128)
    with torch.no_grad():
        logits = model(**inputs).logits

    # Se a soma das probs já for ~1, NÃO aplique softmax.
    # Detecta automaticamente:
    if abs(logits.sum(dim=-1).mean().item() - 1.0) < 0.1:
        probs = logits  # já são probabilidades
    else:
        probs = torch.nn.functional.softmax(logits, dim=-1)

    # id2label: {0: positive, 1: negative, 2: neutral}
    scores = (probs[:, 0] - probs[:, 1]).tolist()
    return scores[0] if single else scores

