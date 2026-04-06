import os
import re

def resolve_path(source_file, import_path):
    dir_name = os.path.dirname(source_file)
    target = os.path.normpath(os.path.join(dir_name, import_path))
    if os.path.isfile(target + '.ts'): return target + '.ts'
    if os.path.isfile(target + '.tsx'): return target + '.tsx'
    if os.path.isfile(target + '/index.ts'): return target + '/index.ts'
    if os.path.isfile(target): return target
    return None

def get_exports(file_path):
    if not file_path: return set()
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            exports = set(re.findall(r'export (?:const|let|var|function|async function|class|interface|type|enum|default) (\w+)', content))
            # Handle export default { ... } or export default router
            default_match = re.search(r'export default (\w+)', content)
            if default_match: exports.add('default')
            elif 'export default ' in content: exports.add('default')
            return exports
    except:
        return set()

with open('filtered_imports.txt', 'r') as f:
    for line in f:
        # Match "file:import { a, b } from 'path'"
        match = re.match(r'([^:]+):import \{(.*)\} from ["\'](.*)["\']', line)
        if match:
            source_file, named_imports, import_path = match.groups()
            if import_path.startswith('.'):
                target_file = resolve_path(source_file, import_path)
                if target_file:
                    exports = get_exports(target_file)
                    for item in named_imports.split(','):
                        item = item.strip().split(' as ')[0].split('type ')[-1].strip()
                        if item and item not in exports and item != '*':
                            print(f"MISSING EXPORT: {item} in {target_file} (imported by {source_file})")
