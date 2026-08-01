let meta = #{
    name: "photosphere-hq",
    description: "Fix ramen photosphere capture + 4dps demo so 3D/4D showcase beats real-time and clearly shows the shop",
    when_to_use: "When 4dps demo is black, low-res, mis-stitched, or does not show the ramen shop",
    phases: [
        #{ title: "Diagnose", detail: "why capture/stitch/demo are trash vs real-time" },
        #{ title: "Fix capture", detail: "high-quality cube→equirect + multi-frame 4D in host room" },
        #{ title: "Wire demo", detail: "4dps demo serves HQ assets via PSV only" },
        #{ title: "Prove", detail: "browser screenshots must show kiosk/neon/shop" },
    ],
};

let diag_schema = #{
    "type": "object",
    "required": ["root_causes", "fix_plan", "summary"],
    "properties": #{
        "root_causes": #{ "type": "array", "maxItems": 12, "items": #{ "type": "string" } },
        "fix_plan": #{ "type": "array", "maxItems": 12, "items": #{ "type": "string" } },
        "summary": #{ "type": "string" },
    },
};

let fix_schema = #{
    "type": "object",
    "required": ["changed", "files", "notes", "equirect_path", "mp4_path"],
    "properties": #{
        "changed": #{ "type": "boolean" },
        "files": #{ "type": "array", "maxItems": 40, "items": #{ "type": "string" } },
        "notes": #{ "type": "string" },
        "equirect_path": #{ "type": "string" },
        "mp4_path": #{ "type": "string" },
    },
};

let prove_schema = #{
    "type": "object",
    "required": ["pass", "demo_url", "evidence", "failures"],
    "properties": #{
        "pass": #{ "type": "boolean" },
        "demo_url": #{ "type": "string" },
        "evidence": #{ "type": "array", "maxItems": 20, "items": #{ "type": "string" } },
        "failures": #{ "type": "array", "maxItems": 20, "items": #{ "type": "string" } },
    },
};

let review_schema = #{
    "type": "object",
    "required": ["ship", "reasons", "must_fix"],
    "properties": #{
        "ship": #{ "type": "boolean" },
        "reasons": #{ "type": "array", "maxItems": 12, "items": #{ "type": "string" } },
        "must_fix": #{ "type": "array", "maxItems": 12, "items": #{ "type": "string" } },
    },
};

// Paths (defaults match this monorepo layout)
let dps = if args == () { () } else { args.dps_root };
if dps == () { dps = "/workspace/zer0/products/4dps"; }
let room = if args == () { () } else { args.room_root };
if room == () { room = "/workspace/portfolio/demos/room"; }
let size = if args == () { () } else { args.face_size };
if size == () { size = 1024; }

// ── Product bar (explicit — showcase quality, not real-time preview) ──
// A) 3D equirect still MUST show Kevin's kiosk + neon readable (not black void)
// B) Stitch continuous — no cube seams, wrong up, inverted faces
// C) Resolution ≥ 2× face_size width for equirect (e.g. 2048×1024 if face=1024)
// D) Quality goal: supersampled / high dpr capture so still looks sharper than live 60fps dpr≤1.5
// E) 4D: multi-frame equirect OR documented orbit yaw sequence → mp4 (not static 1-frame fake)
// F) 4dps demo at :5177 serves new assets; Playwright screenshot proves shop visible
// G) Prefer THREE.CubeCamera or CDP full-frame capture over broken RT if software GL

phase("Diagnose");
log("Diagnosing photosphere HQ failure: room=" + room + " dps=" + dps);

let diag_p = "";
diag_p += "You are diagnosing why the 4dps ramen photosphere demo is trash vs the live shop.\n";
diag_p += "ROOM: " + room + "\n";
diag_p += "4DPS: " + dps + "\n\n";
diag_p += "Read with tools (do not invent):\n";
diag_p += "- " + room + "/src/ShopCanvas.tsx  (__shopCapturePhotosphere, CUBE_FACES, stitch math)\n";
diag_p += "- " + room + "/tools/capture-photosphere.mjs\n";
diag_p += "- " + dps + "/demo/index.html and scripts/demo.mjs\n";
diag_p += "- Latest faces under " + room + "/shots/ramen-demo-photosphere/ (identify mean/std, open images)\n";
diag_p += "- Compare to a good beauty still e.g. " + room + "/shots/loop-r32/01-beauty-hero.png\n\n";
diag_p += "Known product intent: HQ offline photosphere/4D showcase BETTER than real-time for weak hardware.\n";
diag_p += "List concrete root_causes and ordered fix_plan. summary in one paragraph.\n";

let diag = agent(diag_p, #{
    label: "diagnose",
    capability_mode: "all",
    output_schema: diag_schema,
});
if diag == () || !diag.success || diag.output == () {
    pause("verification", "Diagnose agent failed — resume after infra ok");
}
let causes = if diag.output.root_causes == () { [] } else { diag.output.root_causes };
let plan = if diag.output.fix_plan == () { [] } else { diag.output.fix_plan };
let dsum = if diag.output.summary == () { "" } else { diag.output.summary };
log(dsum);

phase("Fix capture");
let fix_p = "";
fix_p += "FIX high-quality photosphere capture for Kevin's Ramen room.\n";
fix_p += "ROOM: " + room + "\n4DPS: " + dps + "\n";
fix_p += "Root causes: " + json_encode(causes) + "\n";
fix_p += "Plan: " + json_encode(plan) + "\n\n";
fix_p += "Requirements:\n";
fix_p += "1. Fix __shopCapturePhotosphere so cube faces show the shop (neon/kiosk readable).\n";
fix_p += "2. Cube face dirs/up + equirect UV must match standard OpenGL cube→equirect (or use THREE.CubeCamera + PMREM-free equirect convert).\n";
fix_p += "3. Capture at face size " + size.to_string() + " or higher; prefer dpr supersample then downscale if needed for AA.\n";
fix_p += "4. Eye origin in OPEN PLAZA in front of kiosk (default ~[0.2,1.85,6] looking around) — not inside geometry.\n";
fix_p += "5. Avoid black RT path: if software GL fails RT, use CDP Page.captureScreenshot after setting camera per face (beauty path works).\n";
fix_p += "6. Rebuild room, run capture-photosphere.mjs --label ramen-hq --size " + size.to_string() + "\n";
fix_p += "7. Produce multi-frame 4D: at least 12 yaw steps around origin → equirect frames → ffmpeg mp4 (not static 1-still fake).\n";
fix_p += "8. Write equirect_path and mp4_path absolute in output.\n";
fix_p += "9. Do not claim success if face std≈0 or mean≈0.25 solid black.\n";
fix_p += "Use run_terminal_command, edit files, build, capture. Return changed, files, notes, paths.\n";

let fix = agent(fix_p, #{
    label: "fix-capture",
    capability_mode: "all",
    output_schema: fix_schema,
});
if fix == () || !fix.success || fix.output == () {
    pause("verification", "Fix capture agent failed");
}
let equirect = if fix.output.equirect_path == () { "" } else { fix.output.equirect_path };
let mp4 = if fix.output.mp4_path == () { "" } else { fix.output.mp4_path };
let fnotes = if fix.output.notes == () { "" } else { fix.output.notes };
log(fnotes);

phase("Wire demo");
let wire_p = "";
wire_p += "Wire 4dps demo to HQ ramen assets.\n";
wire_p += "4DPS: " + dps + "\n";
wire_p += "equirect: " + equirect + "\n";
wire_p += "mp4: " + mp4 + "\n\n";
wire_p += "1. Copy equirect → " + dps + "/demo/assets/ramen-equirect.png\n";
wire_p += "2. Copy mp4 → " + dps + "/demo/assets/ramen-equirect.mp4\n";
wire_p += "3. Ensure demo/index.html uses PSV only (already) and those asset paths.\n";
wire_p += "4. Update scripts/demo.mjs sync paths to prefer ramen-hq / ramen-demo labels.\n";
wire_p += "5. Restart demo: DEMO_PORT=5177 DEMO_NO_OPEN=1 PORTFOLIO_ROOM=" + room + " npm run demo (background)\n";
wire_p += "6. Return same fix_schema with final asset paths under demo/assets.\n";

let wire = agent(wire_p, #{
    label: "wire-demo",
    capability_mode: "all",
    output_schema: fix_schema,
});
if wire != () && wire.success && wire.output != () {
    if wire.output.equirect_path != () { equirect = wire.output.equirect_path; }
    if wire.output.mp4_path != () { mp4 = wire.output.mp4_path; }
    if wire.output.notes != () { log(wire.output.notes); }
}

phase("Prove");
let prove_p = "";
prove_p += "PROVE the photosphere showcase shows the ramen shop.\n";
prove_p += "4DPS: " + dps + " ROOM: " + room + "\n\n";
prove_p += "1. identify stats on equirect: require std > 0.05 and mean not flat black (reject mean≈0.25 std≈0).\n";
prove_p += "2. Open browser to http://127.0.0.1:5177/ (start demo if needed).\n";
prove_p += "3. Playwright screenshot 3D tab + 4D tab; save under " + dps + "/demo/assets/prove-3d.png and prove-4d.png\n";
prove_p += "4. pass=true ONLY if screenshots show kiosk/shop structure (not empty black) — use magick mean/std and visual read_file on png.\n";
prove_p += "5. List evidence paths. failures if any.\n";
prove_p += "If fail once: fix capture again then re-prove.\n";

let prove = agent(prove_p, #{
    label: "prove",
    capability_mode: "all",
    output_schema: prove_schema,
});
if prove == () || !prove.success || prove.output == () {
    pause("verification", "Prove agent failed");
}

let ok = prove.output.pass == true;
let demo_url = if prove.output.demo_url == () { "http://127.0.0.1:5177/" } else { prove.output.demo_url };
let evidence = if prove.output.evidence == () { [] } else { prove.output.evidence };
let failures = if prove.output.failures == () { [] } else { prove.output.failures };

if !ok {
    log("Prove failed — one repair cycle");
    let rep = "";
    rep += "Photosphere prove FAILED. failures=" + json_encode(failures) + "\n";
    rep += "ROOM=" + room + " DPS=" + dps + "\n";
    rep += "Fix capture/stitch/demo, recapture HQ, restart demo, re-screenshot. Return prove_schema.\n";
    let prove2 = agent(rep, #{
        label: "prove-repair",
        capability_mode: "all",
        output_schema: prove_schema,
    });
    if prove2 != () && prove2.success && prove2.output != () {
        prove = prove2;
        ok = prove.output.pass == true;
        demo_url = if prove.output.demo_url == () { demo_url } else { prove.output.demo_url };
        evidence = if prove.output.evidence == () { [] } else { prove.output.evidence };
        failures = if prove.output.failures == () { [] } else { prove.output.failures };
    }
}

// Dual review only if prove passed
let ship_votes = 0;
let must = [];
let reasons = [];
if ok {
    let rj = [];
    rj.push(#{
        prompt: "Adversarially review photosphere HQ for 4dps. Paths: " + dps + " and " + room + ". "
            + "Read ShopCanvas photosphere code, latest equirect under shots/, demo assets. "
            + "ship=true only if equirect clearly shows ramen shop and stitch is continuous. "
            + "Evidence screenshots under demo/assets/prove-*.png if present. must_fix otherwise.",
        label: "review-a",
        capability_mode: "read-only",
        output_schema: review_schema,
    });
    rj.push(#{
        prompt: "Second review: is this better-than-realtime showcase quality? "
            + "Check resolution, that 4D is multi-frame if claimed, demo uses PSV only. "
            + "4dps=" + dps + " room=" + room + ". ship=true only with file evidence.",
        label: "review-b",
        capability_mode: "read-only",
        output_schema: review_schema,
    });
    let reviews = parallel(rj);
    for rev in reviews {
        if rev != () && rev.success && rev.output != () {
            if rev.output.ship == true { ship_votes += 1; }
            if rev.output.must_fix != () {
                for m in rev.output.must_fix { must.push(m); }
            }
            if rev.output.reasons != () {
                for r in rev.output.reasons { reasons.push(r); }
            }
        }
    }
}

let ship = ok && ship_votes >= 2;

let report = "";
report += "# Photosphere HQ — 4dps ramen showcase\n\n";
report += "- room: `" + room + "`\n";
report += "- 4dps: `" + dps + "`\n";
report += "- prove: " + if ok { "PASS" } else { "FAIL" } + "\n";
report += "- ship votes: " + ship_votes.to_string() + "/2\n";
report += "- **ship: " + if ship { "YES" } else { "NO" } + "**\n";
report += "- demo: " + demo_url + "\n\n";
report += "## Diagnosis\n" + dsum + "\n\n";
report += "## Evidence\n";
for e in evidence { report += "- " + e + "\n"; }
if must.len() > 0 {
    report += "\n## Must fix\n";
    for m in must { report += "- " + m + "\n"; }
}
if failures.len() > 0 {
    report += "\n## Failures\n";
    for f in failures { report += "- " + f + "\n"; }
}
report += "\n## Run\n```bash\ncd " + dps + "\nPORTFOLIO_ROOM=" + room + " npm run demo\n# " + demo_url + "\n```\n";

let path = write_scratch_file("photosphere-hq-report.md", report);
if ship {
    log("PHOTOSPHERE HQ SHIP: YES — " + demo_url);
} else {
    log("PHOTOSPHERE HQ SHIP: NO");
}

complete(#{
    ship: ship,
    summary: if ship {
        "HQ photosphere showcase ready — shop visible in PSV demo"
    } else {
        "Photosphere HQ not ready — see failures/must_fix"
    },
    report_path: path,
    demo_url: demo_url,
    prove_pass: ok,
    ship_votes: ship_votes,
    equirect_path: equirect,
    mp4_path: mp4,
    must_fix: must,
    failures: failures,
    evidence: evidence,
});
