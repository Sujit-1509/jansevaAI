"""
sentiment.py — Lightweight NLP sentiment analyzer for JanSevaAI.

Uses NLTK VADER (Valence Aware Dictionary and sEntiment Reasoner)
which is specifically tuned for social-media-style short text —
perfect for citizen feedback on civic complaints.

No model training or GPU required. Lambda-friendly.
"""

import logging
import os
import nltk

logger = logging.getLogger(__name__)

# Ensure VADER lexicon is available.
# In Lambda, we bundle it under ./nltk_data so no download is needed at runtime.
_NLTK_DATA_DIR = os.path.join(os.path.dirname(__file__), "nltk_data")
if os.path.isdir(_NLTK_DATA_DIR):
    nltk.data.path.insert(0, _NLTK_DATA_DIR)

try:
    from nltk.sentiment.vader import SentimentIntensityAnalyzer
except LookupError:
    # Cold-start fallback: download once into /tmp (Lambda writable)
    nltk.download("vader_lexicon", download_dir="/tmp/nltk_data", quiet=True)
    nltk.data.path.insert(0, "/tmp/nltk_data")
    from nltk.sentiment.vader import SentimentIntensityAnalyzer

_analyzer = SentimentIntensityAnalyzer()


def analyze_sentiment(text: str) -> dict:
    """
    Analyze sentiment of a feedback string.

    Args:
        text: Raw feedback text from the citizen.

    Returns:
        dict with keys:
            - sentiment (str):  "positive" | "neutral" | "negative"
            - score (float):    VADER compound score in range [-1, +1]
            - details (dict):   Full VADER polarity breakdown (pos, neu, neg, compound)
    """
    if not text or not text.strip():
        return {
            "sentiment": "neutral",
            "score": 0.0,
            "details": {"pos": 0.0, "neu": 1.0, "neg": 0.0, "compound": 0.0},
        }

    scores = _analyzer.polarity_scores(text)
    compound = scores["compound"]

    if compound >= 0.05:
        label = "positive"
    elif compound <= -0.05:
        label = "negative"
    else:
        label = "neutral"

    logger.info(
        "Sentiment analysis — label=%s compound=%.4f text=%s",
        label,
        compound,
        text[:80],
    )

    return {
        "sentiment": label,
        "score": round(compound, 4),
        "details": scores,
    }
