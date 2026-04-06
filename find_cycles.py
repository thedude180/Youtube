import os
import re
from collections import defaultdict

def resolve_path(source_file, import_path):
    dir_name = os.path.dirname(source_file)
    target = os.path.normpath(os.path.join(dir_name, import_path))
    if os.path.isfile(target + '.ts'): return target + '.ts'
    if os.path.isfile(target + '.tsx'): return target + '.tsx'
    if os.path.isfile(target + '/index.ts'): return target + '/index.ts'
    return None

adj = defaultdict(list)
files_to_scan = []
for root, dirs, files in os.walk('server'):
    for file in files:
        if file.endswith('.ts') or file.endswith('.tsx'):
            files_to_scan.append(os.path.join(root, file))

for source_file in files_to_scan:
    try:
        with open(source_file, 'r') as f:
            content = f.read()
            imports = re.findall(r'from ["\'](\.\.?/.*)["\']', content)
            for imp in imports:
                target = resolve_path(source_file, imp)
                if target:
                    adj[source_file].append(target)
    except:
        pass

def find_cycle(v, visited, stack, path):
    visited.add(v)
    stack.add(v)
    path.append(v)
    
    for neighbor in adj[v]:
        if neighbor not in visited:
            if find_cycle(neighbor, visited, stack, path):
                return True
        elif neighbor in stack:
            path.append(neighbor)
            cycle_start = path.index(neighbor)
            print("CYCLE DETECTED:", " -> ".join(path[cycle_start:]))
            return True
            
    stack.remove(v)
    path.pop()
    return False

visited = set()
for f in files_to_scan:
    if f not in visited:
        find_cycle(f, visited, set(), [])
