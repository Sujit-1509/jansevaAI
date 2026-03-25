import os

def replace_branding_and_tokens():
    replacements = {
        'CivicAI': 'JanSevaAI',
        'Civic AI': 'JanSeva AI',
        'civicai_user': 'jansevaai_user'
    }
    
    for root, _, files in os.walk('src'):
        for file in files:
            if file.endswith('.jsx') or file.endswith('.css') or file.endswith('.js'):
                path = os.path.join(root, file)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    original_content = content
                    for old, new in replacements.items():
                        content = content.replace(old, new)
                    
                    if content != original_content:
                        with open(path, 'w', encoding='utf-8') as f:
                            f.write(content)
                        print(f"Updated: {path}")
                except Exception as e:
                    print(f"Skipping {path}: {e}")

if __name__ == '__main__':
    replace_branding_and_tokens()
