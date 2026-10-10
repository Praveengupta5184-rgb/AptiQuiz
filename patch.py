import sys

dashboard_path = "client/src/pages/TeacherDashboard.jsx"
scratch_path = "client/scratch_CreateTest.jsx"

with open(dashboard_path, "r", encoding="utf-8") as f:
    lines = f.readlines()

with open(scratch_path, "r", encoding="utf-8") as f:
    new_code = f.read()

# 247 to 436 inclusive
start_idx = 246
end_idx = 436

new_lines = lines[:start_idx] + [new_code + "\n"] + lines[end_idx:]

with open(dashboard_path, "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Replaced CreateTest successfully.")
