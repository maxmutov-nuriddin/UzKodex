const fs = require('fs');

function replaceWordsWithNumbers(text) {
    const replacements = {
        'одного': '1', 'одна': '1', 'один': '1',
        'двух': '2', 'две': '2', 'два': '2',
        'трех': '3', 'три': '3',
        'четырех': '4', 'четыре': '4',
        'пяти': '5', 'пять': '5',
        'шести': '6', 'шесть': '6',
        'семи': '7', 'семь': '7',
        'восьми': '8', 'восемь': '8',
        'девяти': '9', 'девять': '9',
        'десяти': '10', 'десять': '10',
        'двенадцати': '12', 'двенадцать': '12',
        'четырнадцати': '14', 'четырнадцать': '14',
        'шестнадцати': '16', 'шестнадцать': '16',
        'восемнадцати': '18', 'восемнадцать': '18',
        'двадцати': '20', 'двадцать': '20',
        'тридцати': '30', 'тридцать': '30',
        'пятидесяти': '50', 'пятьдесят': '50',
        'шестидесяти': '60', 'шестьдесят': '60',
        'семидесяти': '70', 'семьдесят': '70',
        'восьмидесяти': '80', 'восемьдесят': '80',
        'девяноста': '90', 'девяносто': '90',
        'ста': '100', 'сто': '100',
        'двухсот': '200', 'двести': '200',
        'трехсот': '300', 'триста': '300',
        'четырехсот': '400', 'четыреста': '400',
        'пятисот': '500', 'пятьсот': '500',
        'шестисот': '600', 'шестьсот': '600',
        'семисот': '700', 'семьсот': '700',
        'восьмисот': '800', 'восемьсот': '800',
        'девятисот': '900', 'девятьсот': '900',
        'тысячи': '1000', 'тысяча': '1000'
    };

    let result = text;
    
    // Handle specific common compound cases
    result = result.replace(/двадцати\s+пяти/gi, '25');
    result = result.replace(/тридцати\s+пяти/gi, '35');
    result = result.replace(/сорока\s+пяти/gi, '45');
    result = result.replace(/пятидесяти\s+пяти/gi, '55');
    result = result.replace(/четырехсот\s+восьмидесяти/gi, '480');
    
    // Replace base units
    result = result.replace(/базовых\s+расчетных\s+величин/gi, 'БРВ');
    result = result.replace(/базовой\s+расчетной\s+величины/gi, 'БРВ');
    result = result.replace(/базовую\s+расчетную\s+величину/gi, 'БРВ');

    for (const [word, num] of Object.entries(replacements)) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        result = result.replace(regex, num);
    }
    
    return result;
}

function parseText(filePath, type) {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.split('\n');
    const articles = [];
    
    let currentArticle = null;
    const articleRegex = /^Статья\s+(\d+[а-яА-Я0-9-]*)\.\s*(.*)/;
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;
        
        const match = line.match(articleRegex);
        if (match) {
            if (currentArticle) {
                articles.push(currentArticle);
            }
            currentArticle = {
                id: `${type === 'УК' ? 'uk' : 'ak'}-${match[1]}`,
                type: type,
                articleNumber: match[1],
                title: replaceWordsWithNumbers(match[2]),
                content: '',
                punishment: ''
            };
        } else if (currentArticle) {
            line = replaceWordsWithNumbers(line);
            const lowerLine = line.toLowerCase();
            if (lowerLine.includes('наказывается') || lowerLine.includes('влечет наложение штрафа') || lowerLine.includes('наказываются')) {
                currentArticle.punishment += line + ' ';
            }
            currentArticle.content += line + '\n';
        }
    }
    
    if (currentArticle) {
        articles.push(currentArticle);
    }
    
    return articles;
}

const uk = parseText('Уголовный кодекс .txt', 'УК');
const ak = parseText('Административный кодекс .txt', 'АК');

const database = [...uk, ...ak];
fs.writeFileSync('database.json', JSON.stringify(database, null, 2));

console.log(`Parsed ${database.length} articles.`);
