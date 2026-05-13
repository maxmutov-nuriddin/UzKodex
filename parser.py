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

jinoyat = parse_file('jinoyat_kodeksi.html', 'Jinoyat kodeksi')
mamuriy = parse_file('mamuriy_kodeksi.html', 'Maʼmuriy javobgarlik kodeksi')

all_articles = jinoyat + mamuriy

for a in all_articles:
    a['content'] = a['content'].strip()
    content_str = a['content']
    if "jazolanadi" in content_str or "sabab boʻladi" in content_str:
        sentences = re.split(r'(?<=[\.!\?])\s+|\n', content_str)
        for s in reversed(sentences):
            if "jazolanadi" in s or "sabab boʻladi" in s:
                a['punishment'] = s.replace("bazaviy hisoblash miqdorining", "BHMning").strip()
                break

with open('database_uz.json', 'w', encoding='utf-8') as f:
    json.dump(all_articles, f, ensure_ascii=False, indent=2)

print(f"Parsed {len(jinoyat)} Criminal and {len(mamuriy)} Admin articles.")
