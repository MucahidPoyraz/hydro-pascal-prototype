# -*- coding: utf-8 -*-
"""
prototip-formlar derleyicisi.

Girdi : _kaynak-fragmanlar.html + assets/forms.css + assets/forms.js
Çıktı : - <ad>.html            (ayrıştırılmış: harici css/js)
        - tek-dosya/<ad>.html  (inline css/js, tek dosyada çalışır)
        - demo.html            (4 form bir arada)
        - tesekkurler.html     (_next hedefi)
        - kvkk.html            (KVKK linki hedefi — yer tutucu)

Tek-dosya sürümleri ayrıştırılmış sürümden ÜRETİLİR; böylece ikisi asla
birbirinden sapmaz.
"""
import io
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
PROTO = '<!-- PROTOTİP: Bu form ileride React/Next.js veya ASP.NET backend\'e taşınacaktır. FormSubmit geçici çözümdür. -->'

HEAD = """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>{title} — Prototip | HydroPascal</title>
{css}
</head>
<body style="margin:0;background:#eef1f6">
{proto}
<div class="fs-wrap{narrow}">
  <header class="fs-head">
    <h1>{title}</h1>
    <p>{lead}</p>
  </header>
{body}
</div>
{js}
</body>
</html>
"""


def read(p):
    return io.open(os.path.join(HERE, p), encoding='utf-8', newline='').read().replace('\r\n', '\n')


def write(p, s):
    full = os.path.join(HERE, p)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    io.open(full, 'w', encoding='utf-8', newline='\n').write(s)


def parse_fragments(src):
    """<!-- ===== FORM n | slug | başlık | konu | wide|narrow ===== --> ile ayırır."""
    pat = re.compile(r'<!--\s*=====\s*FORM\s+\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(wide|narrow)\s*=====\s*-->')
    marks = list(pat.finditer(src))
    out = []
    for i, m in enumerate(marks):
        start = m.end()
        end = marks[i + 1].start() if i + 1 < len(marks) else len(src)
        out.append({
            'slug': m.group(1),
            'title': m.group(2),
            'subject': m.group(3),
            'width': m.group(4),
            'html': src[start:end].strip('\n ')
        })
    return out


LEADS = {
    'iletisim': 'Sorularınız, teknik destek talepleriniz ve iş birliği önerileriniz için.',
    'teklif': 'Silindir ölçülerinizi paylaşın, size özel fiyat teklifi hazırlayalım.',
    'numune': 'Ürün kataloğumuzu ve/veya fiziksel numune talebinizi iletin.',
    'hizli-iletisim': 'Kısa sorularınız için — 1 dakikada gönderin.',
}


def indent(block, spaces=2):
    pad = ' ' * spaces
    return '\n'.join(pad + line if line.strip() else line for line in block.split('\n'))


def main():
    src = read('_kaynak-fragmanlar.html')
    css = read('assets/forms.css')
    js = read('assets/forms.js')
    forms = parse_fragments(src)
    assert len(forms) == 4, 'Beklenen 4 fragman, bulunan %d' % len(forms)

    names = {'iletisim': 'form-1-iletisim', 'teklif': 'form-2-teklif',
             'numune': 'form-3-numune', 'hizli-iletisim': 'form-4-hizli-iletisim'}

    for f in forms:
        base = names[f['slug']]
        narrow = ' fs-wrap--narrow' if f['width'] == 'narrow' else ''
        common = dict(title=f['title'], lead=LEADS[f['slug']], proto=PROTO,
                      narrow=narrow, body=indent(f['html']))

        # a) ayrıştırılmış
        write(base + '.html', HEAD.format(
            css='<link rel="stylesheet" href="assets/forms.css">',
            js='<script src="assets/forms.js"></script>', **common))

        # b) tek dosya (inline)
        write('tek-dosya/' + base + '-tek-dosya.html', HEAD.format(
            css='<style>\n' + css + '\n</style>',
            js='<script>\n' + js + '\n</script>', **common))

        print('uretildi: %-34s + tek-dosya/%s-tek-dosya.html' % (base + '.html', base))

    # demo: 4 form bir arada
    blocks = []
    for f in forms:
        blocks.append('  <section style="margin-bottom:48px">\n'
                      '    <h2 style="font:700 1.15rem/1.3 -apple-system,Segoe UI,Arial,sans-serif;color:#1a2b4a;'
                      'border-left:4px solid #e85d04;padding-left:10px;margin:0 0 14px">' + f['title'] + '</h2>\n'
                      + indent(f['html'], 4) + '\n  </section>')
    write('demo.html', HEAD.format(
        title='Tüm Formlar (Demo)', lead='Dört formun tek sayfada önizlemesi.', proto=PROTO,
        narrow='', body='\n'.join(blocks),
        css='<link rel="stylesheet" href="assets/forms.css">',
        js='<script src="assets/forms.js"></script>'))
    print('uretildi: demo.html')

    # teşekkür sayfası (_next hedefi — yalnızca dosya ekli klasik POST'ta kullanılır)
    write('tesekkurler.html', """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Teşekkürler — HydroPascal</title>
<link rel="stylesheet" href="assets/forms.css">
</head>
<body style="margin:0;background:#eef1f6">
<div class="fs-wrap fs-wrap--narrow" style="text-align:center;padding-top:80px">
  <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="#1e7a46" stroke-width="1.8" aria-hidden="true" style="margin-bottom:18px">
    <circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <h1 style="font-size:1.5rem;color:#1a2b4a;margin:0 0 10px">Mesajınız bize ulaştı</h1>
  <p style="color:#5b6b87;margin:0 0 26px">Talebiniz için teşekkür ederiz. Ekibimiz en kısa sürede size dönüş yapacaktır.</p>
  <a class="fs-btn" href="demo.html" style="text-decoration:none;display:inline-block">Formlara Dön</a>
</div>
</body>
</html>
""")
    print('uretildi: tesekkurler.html')

    # kvkk yer tutucu
    write('kvkk.html', """<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>KVKK Aydınlatma Metni — HydroPascal</title>
<link rel="stylesheet" href="assets/forms.css">
</head>
<body style="margin:0;background:#eef1f6">
<div class="fs-wrap">
  <header class="fs-head">
    <h1>KVKK Aydınlatma Metni</h1>
    <p>Yer tutucu — gerçek metin hukuk danışmanı tarafından hazırlanacaktır.</p>
  </header>
  <div class="fs-form">
    <p style="margin-top:0"><strong>⚠️ Bu sayfa bir YER TUTUCUDUR.</strong></p>
    <p>Formlar; ad soyad, firma, e-posta, telefon, adres ve dosya eki gibi kişisel veri
    niteliğinde bilgiler topluyor ve bunları <strong>FormSubmit.co (ABD merkezli üçüncü taraf
    işleyici)</strong> üzerinden iletiyor. Bu, KVKK (6698) kapsamında <em>yurt dışına veri
    aktarımı</em> anlamına gelir ve aydınlatma yükümlülüğü doğurur.</p>
    <p>Yayına çıkmadan önce bu sayfada en az şunlar bulunmalıdır: veri sorumlusunun kimliği,
    işleme amacı ve hukuki sebebi, aktarılan taraflar ve aktarım amacı (FormSubmit.co dahil),
    saklama süresi, ilgili kişinin KVKK m.11 hakları ve başvuru kanalı.</p>
    <p>İlgili görev: <code>GÖREV 10.8</code> — bkz. <code>docs/gorev-plani/faz-1-yayin-oncesi.md</code></p>
  </div>
</div>
</body>
</html>
""")
    print('uretildi: kvkk.html')


if __name__ == '__main__':
    main()
