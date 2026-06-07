import sys

def check_brackets(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    depth = 0
    for i, line in enumerate(lines):
        line_num = i + 1
        for char in line:
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
            
            if depth < 0:
                print(f"Error: Negative depth at line {line_num}")
                # return
        
        # Print depth at certain lines to debug
        if line_num in [3779, 3780, 3876, 3925, 3929, 4015, 4016, 4017]:
            print(f"Line {line_num}: depth {depth}")
            
    print(f"Final depth: {depth}")

if __name__ == "__main__":
    check_brackets(r'e:\moises2\app\studio\page.tsx')
