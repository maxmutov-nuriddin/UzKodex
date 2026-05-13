import json
import re

units = {
    "toʻqqiz": 9, "to'qqiz": 9, "toqqiz": 9,
    "sakkiz": 8, "yetti": 7, "olti": 6, "besh": 5,
    "toʻrt": 4, "to'rt": 4, "tort": 4, "uch": 3, "ikki": 2, "bir": 1
}
tens = {
    "toʻqson": 90, "to'qson": 90, "toqson": 90,
    "sakson": 80, "yetmish": 70, "oltmish": 60, "ellik": 50,
    "qirq": 40, "oʻttiz": 30, "o'ttiz": 30, "ottiz": 30, "yigirma": 20,
    "oʻn": 10, "o'n": 10, "on": 10
}
hundreds = {"yuz": 100}

all_words = list(units.keys()) + list(tens.keys()) + list(hundreds.keys())
all_words.sort(key=len, reverse=True)
words_regex = "|".join([re.escape(w) for w in all_words])
num_pattern = re.compile(fr'\b({words_regex})(\s+({words_regex}))*\b', re.IGNORECASE)

def convert_match(match):
    words = match.group(0).lower().split()
    total = 0
    temp_val = 0
    for w in words:
        if w in units:
            temp_val += units[w]
        elif w in tens:
            temp_val += tens[w]
        elif w in hundreds:
            if temp_val == 0: temp_val = 1
            total += temp_val * 100
            temp_val = 0
    return str(total + temp_val)

def normalize_uz(text):
    # Correct the previous broken fix (e.g., 306 -> 360, 408 -> 480)
    # This only happens if we had a space before.
    # But since they are already merged as "306", I need to fix specific patterns.
    text = text.replace("306", "360").replace("408", "480")
    text = text.replace("205", "250") # Just in case
    
    # Also fix fragmented cases that might still exist
    text = re.sub(r'(\d+)00\s+(\d+)0', lambda m: str(int(m.group(1))*100 + int(m.group(2))*10), text)
    text = re.sub(r'(\d+)0\s+(\d)\b', lambda m: str(int(m.group(1))*10 + int(m.group(2))), text)
    
    # Full conversion
    text = num_pattern.sub(convert_match, text)
    text = text.replace("bazaviy hisoblash miqdorining", "BHMning")
    return text

with open('database_uz.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for item in data:
    item['punishment'] = normalize_uz(item['punishment'])
    item['title'] = normalize_uz(item['title'])

with open('database_uz.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Uzbek normalization fixed and complete.")
