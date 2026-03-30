#!/usr/bin/env python3
"""Insert staff records into Supabase after auth users are created."""
import os, sys
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SRK = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

ORG_ID = "00000000-0000-0000-0000-000000000001"
TEAM_ID = "00000000-0000-0000-0000-000000000002"

STAFF = [
    {"id": "21ca5c76-9702-4352-b153-66952def1739", "name": "山田 太郎", "email": "master@paceplatform.com", "role": "master", "is_leader": True},
    {"id": "f5ef0cad-0bad-48ea-b88a-496d279856d4", "name": "鈴木 花子", "email": "at@paceplatform.com",     "role": "AT",     "is_leader": True},
    {"id": "f1065c86-d123-469a-9c1a-96636a000b45", "name": "田中 次郎", "email": "pt@paceplatform.com",     "role": "PT",     "is_leader": False},
    {"id": "512151d7-c5dd-4684-84bd-d1e6793ef5a8", "name": "中村 健",   "email": "sc@paceplatform.com",     "role": "S&C",    "is_leader": True},
]

ATHLETES = [
    {"name": "田中 健太", "position": "FW", "number": 9,  "age": 22, "sex": "male"},
    {"name": "鈴木 大輔", "position": "MF", "number": 8,  "age": 24, "sex": "male"},
    {"name": "山田 翔",   "position": "DF", "number": 5,  "age": 26, "sex": "male"},
    {"name": "小林 翼",   "position": "MF", "number": 6,  "age": 21, "sex": "male"},
    {"name": "伊藤 陽介", "position": "GK", "number": 1,  "age": 25, "sex": "male"},
    {"name": "渡辺 優",   "position": "DF", "number": 3,  "age": 23, "sex": "male"},
    {"name": "佐藤 凌",   "position": "FW", "number": 11, "age": 20, "sex": "male"},
    {"name": "中島 颯太", "position": "MF", "number": 10, "age": 24, "sex": "male"},
    {"name": "加藤 蓮",   "position": "DF", "number": 4,  "age": 22, "sex": "male"},
    {"name": "松本 悠",   "position": "MF", "number": 7,  "age": 25, "sex": "male"},
]

def main():
    client = create_client(SUPABASE_URL, SRK)

    print("Inserting staff records...")
    for s in STAFF:
        row = {**s, "org_id": ORG_ID, "team_id": TEAM_ID, "is_active": True}
        try:
            client.table("staff").upsert(row, on_conflict="id").execute()
            print(f"  OK: {s['name']} ({s['role']})")
        except Exception as e:
            print(f"  ERR: {s['name']}: {e}")

    print("\nInserting athlete records...")
    for a in ATHLETES:
        row = {**a, "org_id": ORG_ID, "team_id": TEAM_ID, "is_active": True}
        try:
            result = client.table("athletes").insert(row).execute()
            print(f"  OK: {a['name']} ({a['position']})")
        except Exception as e:
            print(f"  ERR: {a['name']}: {e}")

    print("\nVerifying...")
    staff_count = len(client.table("staff").select("id").execute().data)
    athlete_count = len(client.table("athletes").select("id").execute().data)
    print(f"  Staff: {staff_count} records")
    print(f"  Athletes: {athlete_count} records")
    print("\nDone.")

if __name__ == "__main__":
    main()
