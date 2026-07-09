import json
import pathlib
import re
import sys


source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])


def parse_rule(name, text):
    lowered = text.lower()
    min_match = re.search(r"minlength:\s*(\d+)", lowered)
    max_match = re.search(r"maxlength:\s*(\d+)", lowered)
    required_parts = re.findall(r"required:\s*([^;]+)", lowered)
    allowed_parts = re.findall(r"allowed:\s*([^;]+)", lowered)
    required = " ".join(required_parts)
    allowed = " ".join(allowed_parts)

    special_tokens = ("special", "[", "!", "@", "#", "$", "%", "^", "&", "*")
    allow_special = True
    if allowed and not any(token in allowed for token in special_tokens):
        allow_special = False

    return {
        "name": name,
        "minLength": int(min_match.group(1)) if min_match else 8,
        "maxLength": int(max_match.group(1)) if max_match else None,
        "requireUppercase": "upper" in required,
        "requireLowercase": "lower" in required,
        "requireNumber": "digit" in required,
        "requireSpecial": any(token in required for token in special_tokens),
        "allowSpecial": allow_special,
        "rawRules": text,
    }


raw_data = json.loads(source.read_text(encoding="utf-8"))
normalized = {
    "Default": {
        "name": "기본",
        "minLength": 8,
        "maxLength": None,
        "requireUppercase": False,
        "requireLowercase": False,
        "requireNumber": False,
        "requireSpecial": False,
        "allowSpecial": True,
        "rawRules": "minlength: 8; allowed: lower, upper, digit, special;",
    },
    "Google": {
        "name": "Google",
        "minLength": 8,
        "maxLength": None,
        "requireUppercase": False,
        "requireLowercase": False,
        "requireNumber": False,
        "requireSpecial": False,
        "allowSpecial": True,
        "rawRules": "minlength: 8; allowed: lower, upper, digit, special;",
    },
    "Samsung": {
        "name": "Samsung",
        "minLength": 8,
        "maxLength": 15,
        "requireUppercase": True,
        "requireLowercase": True,
        "requireNumber": True,
        "requireSpecial": True,
        "allowSpecial": True,
        "rawRules": "minlength: 8; maxlength: 15; required: digit; required: special; required: upper,lower;",
    },
    "Github": {
        "name": "Github",
        "minLength": 8,
        "maxLength": None,
        "requireUppercase": False,
        "requireLowercase": False,
        "requireNumber": False,
        "requireSpecial": False,
        "allowSpecial": True,
        "rawRules": "minlength: 8; allowed: lower, upper, digit, special;",
    },
}

for site, payload in sorted(raw_data.items()):
    rule_text = payload.get("password-rules", "")
    if rule_text:
        normalized[site] = parse_rule(site, rule_text)

target.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"wrote {len(normalized)} rules to {target}")
