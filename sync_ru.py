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
        text = self.buffer
        # Aggressive boilerplate removal
        text = text.replace("Отправить предложение к документу", "")
        text = text.replace("Прослушать аудиозапись", "")
        text = text.replace("Получить ссылку на элемент документа", "")
        text = text.replace("Предложения по документу", "")
        text = text.replace("Прослушать аудио", "")
        text = text.replace("Получить ссылку из элемента документа", "")
        
        text = re.sub(r'\s+', ' ', text).strip()
        if not text: return

        if 'CLAUSE_DEFAULT' in self.current_class or 'SUB_CLAUSE_DEFAULT' in self.current_class:
            num_match = re.search(r'Статья\s*([\d\s\-\.]+)', text, re.IGNORECASE)
            if num_match:
                art_num = num_match.group(1).strip().rstrip('.')
                title = text.split('.', 1)[-1].strip() if '.' in text else text
                self.current_article = {
                    "type": self.code_type,
                    "articleNumber": art_num,
                    "title": title,
                    "content": "",
                    "punishment": "Неизвестно"
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

def normalize_ru_nums(text):
    common = {
        "пятисот": "500", "пятиста": "500", "пятьсот": "500",
        "четырехсот": "400", "четыреста": "400",
        "трехсот": "300", "триста": "300",
        "двухсот": "200", "двести": "200",
        "ста": "100", "сто": "100",
        "девяноста": "90", "девяносто": "90",
        "восьмидесяти": "80", "восемьдесят": "80",
        "семидесяти": "70", "семьдесят": "70",
        "шестидесяти": "60", "шестьдесят": "60",
        "пятидесяти": "50", "пятьдесят": "50",
        "сорока": "40", "сорок": "40",
        "тридцати": "30", "тридцать": "30",
        "двадцать пять": "25", "двадцати пяти": "25",
        "двадцати": "20", "двадцать": "20",
        "пятнадцати": "15", "пятнадцать": "15",
        "десяти": "10", "десять": "10",
        "девяти": "9", "девять": "9",
        "восьми": "8", "восемь": "8",
        "семи": "7", "семь": "7",
        "шести": "6", "шесть": "6",
        "пяти": "5", "пять": "5",
        "четырех": "4", "четыре": "4",
        "трех": "3", "три": "3",
        "двух": "2", "две": "2", "два": "2",
        "одной": "1", "одного": "1", "один": "1"
    }
    sorted_keys = sorted(common.keys(), key=len, reverse=True)
    res = text
    for k in sorted_keys:
        pattern = r'\b' + re.escape(k) + r'\b'
        res = re.sub(pattern, common[k], res, flags=re.IGNORECASE)
    
    res = res.replace("базовой расчетной величины", "БРВ").replace("базовых расчетных величин", "БРВ")
    return res

def extract_punishment(content_str):
    if "наказывается" in content_str or "влечет" in content_str:
        sentences = re.split(r'(?<=[\.!\?])\s+|\n', content_str)
        for s in reversed(sentences):
            if "наказывается" in s or "влечет" in s:
                return normalize_ru_nums(s.strip())
    return "Неизвестно"

# Sync
jinoyat = parse_file('jinoyat_ru.html', 'Уголовный кодекс')
mamuriy = parse_file('mamuriy_ru.html', 'Кодекс об административной ответственности')
all_articles = jinoyat + mamuriy

for a in all_articles:
    a['content'] = a['content'].strip()
    # Extra cleanup for content
    a['content'] = a['content'].replace("Предложения по документу", "").replace("Прослушать аудио", "").replace("Получить ссылку из элемента документа", "").strip()
    a['punishment'] = extract_punishment(a['content'])

with open('database.json', 'w', encoding='utf-8') as f:
    json.dump(all_articles, f, ensure_ascii=False, indent=2)

print(f"RU Sync Complete: {len(all_articles)} articles.")
