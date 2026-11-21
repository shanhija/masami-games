#!/usr/bin/env python3
# The status line for this project: shows the weekly usage and saves Claude Code's rate limits to
# usage.json beside this script, so the agent can stop before 95 percent of the weekly limit
# (.cursor/rules/coding-style.md). A run without rate limits leaves the last saved ones.
import json
import os
import sys
import time

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'usage.json')

limits = json.load(sys.stdin).get('rate_limits') or {}
if limits:
    tmp = OUT + '.tmp'
    with open(tmp, 'w') as f:
        json.dump({'saved_at': int(time.time()), 'rate_limits': limits}, f)
    os.replace(tmp, OUT)
week = (limits.get('seven_day') or {}).get('used_percentage')
print('week ?' if week is None else 'week %d%%' % min(100, round(week)))
