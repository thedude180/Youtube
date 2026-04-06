import os
import re

def get_exports(file_path):
    if not file_path: return set()
    try:
        with open(file_path, 'r') as f:
            content = f.read()
            # Basic export detection
            exports = set(re.findall(r'export (?:const|let|var|function|async function|class|interface|type|enum|default) (\w+)', content))
            # Find common patterns in shared/schema.ts like pgTable exports
            pg_tables = re.findall(r'export const (\w+) = pgTable', content)
            exports.update(pg_tables)
            return exports
    except:
        return set()

schema_exports = get_exports('shared/schema.ts')
auth_exports = get_exports('shared/models/auth.ts')
routes_exports = get_exports('shared/routes.ts')

with open('shared_imports.txt', 'r') as f:
    for line in f:
        match = re.match(r'([^:]+):import \{(.*)\} from ["\'](.*)["\']', line)
        if match:
            source_file, named_imports, import_path = match.groups()
            target_exports = set()
            if import_path == '@shared/schema': target_exports = schema_exports
            elif import_path == '@shared/models/auth': target_exports = auth_exports
            elif import_path == '@shared/routes': target_exports = routes_exports
            else: continue
            
            for item in named_imports.split(','):
                item = item.strip().split(' as ')[0].split('type ')[-1].strip()
                if item and item not in target_exports and item != '*':
                    print(f"MISSING SHARED EXPORT: {item} in {import_path} (imported by {source_file})")
