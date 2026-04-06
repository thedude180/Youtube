import os
import re

def check_file_exists(file_path):
    if os.path.isfile(file_path):
        return True
    if os.path.isfile(file_path + '.ts'):
        return True
    if os.path.isfile(file_path + '.tsx'):
        return True
    if os.path.isfile(os.path.join(file_path, 'index.ts')):
        return True
    return False

with open('filtered_imports.txt', 'r') as f:
    for line in f:
        match = re.match(r'(server/(?:services|routes)/[^:]+):import .* from ["\'](.*)["\']', line)
        if match:
            source_file = match.group(1)
            import_path = match.group(2)
            
            if import_path.startswith('.'):
                target_path = os.path.normpath(os.path.join(os.path.dirname(source_file), import_path))
                if not check_file_exists(target_path):
                    print(f"MISSING: {source_file} imports {import_path} (resolved to {target_path})")
