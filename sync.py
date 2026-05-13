import re
import json
from html.parser import HTMLParser

class LexParser(HTMLParser):
    def __init__(self, code_type):
        super().__init__()
        self.code_type = code_type
        self.articles = []
        self.current_article = None
        self.recording = False
        self.current_class = None
        self.buffer = ""
        self.depth = 0

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        cls = attrs_dict.get('class', '')
        if tag == 'div' and any(x in cls for x in ['CLAUSE_DEFAULT', 'ACT_TEXT', 'SUB_CLAUSE_DEFAULT']):
            self.recording = True
            self.current_class = cls
            self.buffer = ""
            self.depth = 1
        elif self.recording:
            self.depth += 1

    def handle_data(self, data):
        if self.recording:
            self.buffer += data

    def handle_endtag(self, tag):
        if self.recording:
            self.depth -= 1
            if self.depth == 0:
                self.process_buffer()
                self.recording = False

    def process_buffer(self):
        text = self.buffer.replace("Hujjatga taklif yuborish", "").replace("Audioni tinglash", "").replace("Hujjat elementidan havola olish", "")
        text = re.sub(r'\s+', ' ', text).strip()
        if not text: return

        if 'CLAUSE_DEFAULT' in self.current_class or 'SUB_CLAUSE_DEFAULT' in self.current_class:
            num_match = re.search(r'(\d+)\s*([\d\s]*)\s*-\s*modda', text, re.IGNORECASE)
            if num_match:
                art_num = num_match.group(1)
                if num_match.group(2).strip():
                    art_num += " " + num_match.group(2).strip()
                title = text.split('modda.', 1)[-1].strip() if 'modda.' in text else text
                self.current_article = {
                    "type": self.code_type,
                    "articleNumber": art_num,
                    "title": title,
                    "content": "",
                    "punishment": "Noma'lum"
                }
                self.articles.append(self.current_article)
        elif 'ACT_TEXT' in self.current_class and self.current_article:
            self.current_article["content"] += "\n" + text

def parse_file(filename, code_type):
    with open(filename, 'r', encoding='utf-8') as f:
        html_content = f.read()
    parser = LexParser(code_type)
    parser.feed(html_content)
    return parser.articles

def get_key(art):
    return f"{art['type']}_{art['articleNumber']}"

# 1. Parse latest from Lex.uz
api_jinoyat = parse_file('jinoyat_latest.html', 'Jinoyat kodeksi')
api_mamuriy = parse_file('mamuriy_latest.html', 'Maʼmuriy javobgarlik kodeksi')
api_all = api_jinoyat + api_mamuriy
api_dict = {get_key(a): a for a in api_all}

# 2. Load current database
with open('database_uz.json', 'r', encoding='utf-8') as f:
    db_all = json.load(f)
db_dict = {get_key(a): a for a in db_all}

# 3. Compare and Sync
synced_articles = []
missing_from_api = []
added_count = 0
updated_count = 0

# Check all from API
for key, api_art in api_dict.items():
    if key in db_dict:
        # Update existing (if needed, but for now we trust API as source of truth)
        # We preserve any special fields we might have added, but update content
        db_art = db_dict[key]
        if db_art['content'] != api_art['content'].strip():
            db_art['content'] = api_art['content'].strip()
            updated_count += 1
        synced_articles.append(db_art)
    else:
        # Add new
        api_art['content'] = api_art['content'].strip()
        synced_articles.append(api_art)
        added_count += 1

# Check what's in DB but NOT in API
for key, db_art in db_dict.items():
    if key not in api_dict:
        db_art['status'] = "Lex.uz saytida topilmadi"
        missing_from_api.append(db_art)

# 4. Final Processing (Punishment extraction for all)
def extract_punishment(art):
    content_str = art['content']
    if "jazolanadi" in content_str or "sabab boʻladi" in content_str:
        sentences = re.split(r'(?<=[\.!\?])\s+|\n', content_str)
        for s in reversed(sentences):
            if "jazolanadi" in s or "sabab boʻladi" in s:
                return s.replace("bazaviy hisoblash miqdorining", "BHMning").strip()
    return "Noma'lum"

for a in synced_articles + missing_from_api:
    a['punishment'] = extract_punishment(a)

# 5. Output Results
result = {
    "active": synced_articles,
    "missing_from_api": missing_from_api
}

# We still want the main database to be a flat list, but maybe we separate them at the end
final_db = synced_articles + missing_from_api

with open('database_uz.json', 'w', encoding='utf-8') as f:
    json.dump(final_db, f, ensure_ascii=False, indent=2)

print(f"Sync Complete:")
print(f"- Yangi qo'shildi: {added_count}")
print(f"- Yangilandi: {updated_count}")
print(f"- API'da yo'q (eskirgan yoki boshqa): {len(missing_from_api)}")
print(f"- Jami faol: {len(synced_articles)}")
