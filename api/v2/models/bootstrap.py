"""
Database bootstrap — runs schema.sql and seeds master data.
Called once on first startup if tables don't exist.
"""
import os, psycopg2, psycopg2.extras

def bootstrap(database_url: str):
    url = database_url
    if url.startswith('postgres://'): url = 'postgresql://' + url[11:]
    conn = psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    cur = conn.cursor()

    schema_path = os.path.join(os.path.dirname(__file__), 'schema.sql')
    with open(schema_path) as f:
        schema_sql = f.read()

    # Execute schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
    try:
        cur.execute(schema_sql)
        print("[v2] Schema applied ✅", flush=True)
    except Exception as e:
        print(f"[v2] Schema warning: {e}", flush=True)

    # Seed master data
    _seed(cur)
    conn.close()
    print("[v2] Bootstrap complete ✅", flush=True)


def _seed(cur):
    seeds = [
        ("master_user_roles", "name", [
            ("Admin",             "Full system access"),
            ("HR Manager",        "HR operations access"),
            ("Recruiting Manager","Full TA access"),
            ("Account Manager",   "Client and TA access"),
            ("Recruiter",         "Recruiter access"),
            ("Finance Manager",   "Finance full access"),
            ("Finance",           "Finance access"),
            ("Employee",          "Self-service portal only"),
        ]),
        ("master_employment_types", "name", [
            ("Full-Time",), ("Part-Time",), ("Contract",),
            ("Intern",), ("Consultant",), ("Freelancer",),
        ]),
        ("master_contract_types", "name", [
            ("Fixed-Price",), ("Time & Material",), ("Retainer",), ("Milestone-Based",),
        ]),
        ("master_timesheet_statuses", "name", [
            ("Pending",), ("Approved",), ("Rejected",), ("Draft",),
        ]),
        ("master_invoice_statuses", "name", [
            ("Draft",), ("Sent",), ("Partially Paid",), ("Paid",), ("Overdue",), ("Cancelled",),
        ]),
        ("master_payroll_run_types", "name", [
            ("Monthly",), ("Supplementary",), ("Bonus",), ("Final Settlement",),
        ]),
        ("master_candidate_sources", "name", [
            ("Job Portal",), ("LinkedIn",), ("Employee Referral",), ("Direct Application",),
            ("Vendor",), ("Campus",), ("Social Media",), ("Walk-in",),
        ]),
        ("master_application_stages", "name", [
            ("Applied",),("Screening",),("Interview",),("Technical",),
            ("HR Round",),("Offer",),("Accepted",),("Rejected",),
        ]),
        ("master_interview_formats", "name", [
            ("Video Call",), ("In-Person",), ("Phone",), ("Panel",), ("Assessment",),
        ]),
        ("master_payment_terms", "name", [
            ("Net 15",), ("Net 30",), ("Net 45",), ("Net 60",), ("Due on Receipt",),
        ]),
        ("master_priority_levels", "name", [
            ("Critical",), ("High",), ("Medium",), ("Low",),
        ]),
        ("master_vendor_categories", "name", [
            ("Staffing Agency",), ("Payroll Provider",), ("Background Check",),
            ("IT Services",), ("Legal",), ("Consulting",),
        ]),
    ]

    for table, key_col, values in seeds:
        for row in values:
            try:
                placeholders = ','.join(['%s']*len(row))
                cols = key_col if len(row) == 1 else key_col + ',description'
                cur.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT({key_col}) DO NOTHING", row)
            except Exception as e:
                print(f"[seed] {table}: {e}", flush=True)

    # Fix application stage ordering
    stages_order = ["Applied","Screening","Interview","Technical","HR Round","Offer","Accepted","Rejected"]
    for i, name in enumerate(stages_order):
        colors = {"Applied":"#6b7280","Screening":"#3b82f6","Interview":"#8b5cf6",
                  "Technical":"#f59e0b","HR Round":"#06b6d4","Offer":"#10b981",
                  "Accepted":"#22c55e","Rejected":"#ef4444"}
        try:
            cur.execute("UPDATE master_application_stages SET order_seq=%s, color=%s WHERE name=%s",
                       (i, colors.get(name,'#6b7280'), name))
        except Exception: pass

    # Create default Admin user if none exists
    try:
        cur.execute("SELECT id FROM users LIMIT 1")
        if not cur.fetchone():
            import hashlib
            pw = hashlib.sha256("Admin@123".encode()).hexdigest()
            cur.execute("SELECT id FROM master_user_roles WHERE name='Admin' LIMIT 1")
            role = cur.fetchone()
            if role:
                cur.execute("""INSERT INTO users (username, email, password_hash, role_id, full_name, is_active)
                    VALUES ('admin','admin@mcraan.com',%s,%s,'System Administrator',TRUE)
                    ON CONFLICT(username) DO NOTHING""", (pw, role['id']))
                print("[v2] Default admin user created", flush=True)
    except Exception as e:
        print(f"[v2] Admin seed: {e}", flush=True)
