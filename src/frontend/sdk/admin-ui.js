// Content styles for the legacy MAK management pages (guests, hosts,
// devices, sessions, logs, settings and license detail). They now render
// inside the one production SDK glass shell, so this file only styles page
// content and intentionally defines no sidebar, theme or accent of its own.

export const MAK_ADMIN_CSS = `
.mak-admin{--ok:#059669;--ok-soft:rgba(5,150,105,.12);--warn:#B45309;--warn-soft:rgba(180,83,9,.12);--bad:#DC2626;--bad-soft:rgba(220,38,38,.10);--info:#2563EB;--info-soft:rgba(37,99,235,.10);color:var(--ink);font-size:14px;line-height:1.45;min-width:0}
html[data-mode="dark"] .mak-admin{--ok:#34D399;--ok-soft:rgba(16,185,129,.15);--warn:#FBBF24;--warn-soft:rgba(245,158,11,.15);--bad:#F87171;--bad-soft:rgba(239,68,68,.15);--info:#93C5FD;--info-soft:rgba(59,130,246,.15)}
.mak-admin *{box-sizing:border-box}
.mak-admin .ic{display:inline-block;vertical-align:-3px;flex-shrink:0}
.mak-admin .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;letter-spacing:-.01em}
.mak-admin .small{font-size:12px}
.mak-admin .muted{color:var(--muted)}
.mak-admin .text-warn{color:var(--warn)}
.mak-admin .text-bad{color:var(--bad)}
.mak-admin .text-ok{color:var(--ok)}
.mak-admin .nowrap{white-space:nowrap}
.mak-admin .grow{flex:1;min-width:0}
.mak-admin a{color:inherit;text-decoration:none}
.mak-admin button,.mak-admin input,.mak-admin select,.mak-admin textarea{font:inherit}
.mak-admin button{cursor:pointer}
.mak-admin .page-head{display:flex;align-items:flex-end;gap:20px;justify-content:space-between;flex-wrap:wrap;margin-bottom:22px}
.mak-admin .page-head-copy{min-width:0}
.mak-admin .eyebrow{font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:var(--acc);margin-bottom:7px}
.mak-admin .page-head h1{font-size:28px;line-height:1.1;letter-spacing:-.035em;margin:0;font-weight:900}
.mak-admin .page-head p{margin:7px 0 0;color:var(--muted);font-size:13px;max-width:680px}
.mak-admin .page-head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.mak-admin .section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;margin:0 0 12px}
.mak-admin .section-head h2{font-size:15px;margin:0;letter-spacing:-.015em;font-weight:800}
.mak-admin .section-head p{font-size:11.5px;color:var(--muted);margin:3px 0 0}
.mak-admin .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:12.5px;font-weight:750;padding:10px 14px;transition:.16s ease;white-space:nowrap;line-height:1.2}
.mak-admin .btn:hover{background:var(--surface2);border-color:var(--faint)}
.mak-admin .btn-primary{background:var(--acc);border-color:var(--acc);color:#fff;box-shadow:0 2px 8px var(--acc-glow)}
.mak-admin .btn-primary:hover{background:var(--acc-d);border-color:var(--acc-d)}
.mak-admin .btn-danger{background:var(--bad-soft);border-color:rgba(220,38,38,.25);color:var(--bad)}
.mak-admin .btn-danger:hover{background:var(--bad-soft);color:var(--bad);border-color:var(--bad)}
.mak-admin .btn-ghost{background:transparent;border-color:var(--line)}
.mak-admin .btn-sm{padding:7px 10px;font-size:11.5px;border-radius:9px;gap:6px}
.mak-admin .btn:disabled{opacity:.45;cursor:not-allowed}
.mak-admin .link{color:var(--acc);font-weight:700}
.mak-admin .link:hover{text-decoration:underline}
.mak-admin .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.05);padding:20px;min-width:0}
.mak-admin .card.tight{padding:0;overflow:hidden}
.mak-admin .card.tight>.section-head{padding:18px 20px 0}
.mak-admin .card-body{padding:20px}
.mak-admin .divider{height:1px;background:var(--line);margin:16px 0}
.mak-admin .grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.mak-admin .grid-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.mak-admin .grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.mak-admin .stack{display:flex;flex-direction:column;gap:14px}
.mak-admin .row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.mak-admin .spread{display:flex;align-items:center;justify-content:space-between;gap:12px}
.mak-admin .hero{position:relative;overflow:hidden;border-radius:20px;border:1px solid var(--line);background:linear-gradient(120deg,var(--acc-soft),var(--surface));padding:24px;margin-bottom:20px}
.mak-admin .hero-grid{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center}
.mak-admin .hero-kicker{display:inline-flex;align-items:center;gap:7px;padding:5px 10px;border-radius:99px;border:1px solid rgba(5,150,105,.25);background:rgba(5,150,105,.08);color:var(--acc);font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
.mak-admin .hero h2{font-size:clamp(23px,3.4vw,34px);line-height:1.08;letter-spacing:-.04em;margin:0;font-weight:900;max-width:640px}
.mak-admin .hero h2 .grad{color:var(--acc)}
.mak-admin .hero p{color:var(--muted);margin:10px 0 0;max-width:600px;font-size:13px}
.mak-admin .hero-meta{display:flex;gap:18px;flex-wrap:wrap;margin-top:18px}
.mak-admin .hero-meta div{font-size:10px;color:var(--faint);font-weight:800;letter-spacing:.12em;text-transform:uppercase}
.mak-admin .hero-meta b{display:block;font-size:12.5px;color:var(--ink);letter-spacing:0;text-transform:none;font-weight:750;margin-top:2px}
.mak-admin .server-control{min-width:220px;padding:16px;border-radius:16px;border:1px solid var(--line);background:var(--surface)}
.mak-admin .server-control .sc-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mak-admin .server-control .sc-label{font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.mak-admin .server-control .sc-state{font-size:22px;font-weight:900;letter-spacing:-.03em;margin-top:2px}
.mak-admin .server-control .sc-state.on{color:var(--ok)}
.mak-admin .server-control .sc-state.off{color:var(--bad)}
.mak-admin .server-control .sc-note{font-size:11px;color:var(--muted);margin:7px 0 13px}
.mak-admin .server-control .btn{width:100%}
.mak-admin .kpi{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:var(--surface);border:1px solid var(--line);min-width:0}
.mak-admin .kpi-top{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mak-admin .kpi-ic{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(5,150,105,.18)}
.mak-admin .kpi-ic.cyan,.mak-admin .kpi-ic.green{background:var(--acc-soft);color:var(--acc);border-color:rgba(5,150,105,.18)}
.mak-admin .kpi-ic.amber{background:var(--warn-soft);color:var(--warn);border-color:rgba(180,83,9,.18)}
.mak-admin .kpi-label{font-size:9.5px;font-weight:800;letter-spacing:.15em;text-transform:uppercase;color:var(--faint)}
.mak-admin .kpi-value{font-size:30px;line-height:1;font-weight:900;letter-spacing:-.045em}
.mak-admin .kpi-foot{font-size:10.5px;color:var(--muted);display:flex;align-items:center;gap:5px}
.mak-admin .table-wrap{border:1px solid var(--line);border-radius:12px;overflow:auto;background:var(--surface)}
.mak-admin table.tbl{width:100%;border-collapse:collapse;min-width:700px}
.mak-admin .tbl th{text-align:left;padding:10px 14px;font-size:9.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--faint);background:var(--surface2);border-bottom:1px solid var(--line);white-space:nowrap}
.mak-admin .tbl td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:12.5px}
.mak-admin .tbl tr:last-child td{border-bottom:0}
.mak-admin .tbl tbody tr:hover{background:var(--surface2)}
.mak-admin .tbl .cell-main{font-weight:750;color:var(--ink)}
.mak-admin .tbl .cell-sub{font-size:10.5px;color:var(--muted);margin-top:2px}
.mak-admin .tbl .actions{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}
.mak-admin .table-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-top:1px solid var(--line);font-size:11px;color:var(--muted)}
.mak-admin .table-empty{padding:34px 16px;text-align:center;color:var(--muted)}
.mak-admin .badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:99px;font-size:9.5px;font-weight:850;letter-spacing:.07em;white-space:nowrap;border:1px solid transparent;text-transform:uppercase}
.mak-admin .badge-dot{width:5px;height:5px;border-radius:99px;background:currentColor}
.mak-admin .badge.ok{background:var(--ok-soft);color:var(--ok);border-color:rgba(5,150,105,.2)}
.mak-admin .badge.warn{background:var(--warn-soft);color:var(--warn);border-color:rgba(180,83,9,.2)}
.mak-admin .badge.bad{background:var(--bad-soft);color:var(--bad);border-color:rgba(220,38,38,.2)}
.mak-admin .badge.info{background:var(--info-soft);color:var(--info);border-color:rgba(37,99,235,.2)}
.mak-admin .badge.neutral{background:var(--surface2);color:var(--muted);border-color:var(--line)}
.mak-admin .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:7px;font-size:10px;font-weight:800;background:var(--surface2);color:var(--muted);border:1px solid var(--line);white-space:nowrap}
.mak-admin .chip.acc{background:var(--acc-soft);color:var(--acc);border-color:rgba(5,150,105,.2)}
.mak-admin .chip.ok{background:var(--ok-soft);color:var(--ok);border-color:rgba(5,150,105,.2)}
.mak-admin .chip.bad{background:var(--bad-soft);color:var(--bad);border-color:rgba(220,38,38,.2)}
.mak-admin .toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.mak-admin .search{position:relative;flex:1;min-width:200px;max-width:380px}
.mak-admin .search .ic{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--faint)}
.mak-admin .search input{width:100%;padding:10px 12px 10px 37px;border-radius:11px;border:1px solid var(--line);background:var(--surface);color:var(--ink);outline:none;font-size:12.5px}
.mak-admin .search input:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-soft)}
.mak-admin .segmented{display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:11px;border:1px solid var(--line);background:var(--surface);max-width:100%;overflow-x:auto}
.mak-admin .segmented a{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;color:var(--muted);font-size:11px;font-weight:750;white-space:nowrap}
.mak-admin .segmented a.active{background:var(--acc-soft);color:var(--acc);box-shadow:inset 0 0 0 1px rgba(5,150,105,.2)}
.mak-admin .segmented a span{font-size:9.5px;background:var(--surface2);padding:1px 5px;border-radius:99px}
.mak-admin .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.mak-admin .form-grid .span-2{grid-column:span 2}
.mak-admin .field{display:flex;flex-direction:column;gap:6px;min-width:0}
.mak-admin .field-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.mak-admin .field-hint{font-size:10.5px;color:var(--faint);line-height:1.4}
.mak-admin input,.mak-admin select,.mak-admin textarea{width:100%;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);outline:none;font-size:12.5px}
.mak-admin input:focus,.mak-admin select:focus,.mak-admin textarea:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-soft)}
.mak-admin textarea{min-height:80px;resize:vertical}
.mak-admin input[type=checkbox]{width:15px;height:15px;accent-color:var(--acc)}
.mak-admin .form-actions{display:flex;align-items:center;justify-content:flex-end;gap:9px;margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}
.mak-admin .toggle-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid var(--line);border-radius:11px;background:var(--surface)}
.mak-admin .toggle-copy b{display:block;font-size:12px;font-weight:750}
.mak-admin .toggle-copy small{display:block;font-size:10.5px;color:var(--muted);margin-top:2px}
.mak-admin .switch{position:relative;width:44px;height:24px;flex-shrink:0;display:inline-block}
.mak-admin .switch input{position:absolute;opacity:0;width:0;height:0}
.mak-admin .switch-track{position:absolute;inset:0;border-radius:99px;background:var(--surface2);border:1px solid var(--line);transition:.2s}
.mak-admin .switch-thumb{position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;box-shadow:0 2px 5px rgba(0,0,0,.25);transition:.2s}
.mak-admin .switch input:checked ~ .switch-track{background:var(--acc);border-color:var(--acc)}
.mak-admin .switch input:checked ~ .switch-thumb{transform:translateX(20px)}
.mak-admin .check-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
.mak-admin .check-card{display:flex;align-items:flex-start;gap:9px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--surface);cursor:pointer}
.mak-admin .check-card b{display:block;font-size:11.5px}
.mak-admin .check-card small{display:block;font-size:10px;color:var(--muted);margin-top:1px;word-break:break-all}
.mak-admin .alert{display:flex;align-items:flex-start;gap:10px;padding:12px 13px;border-radius:12px;border:1px solid var(--line);margin-bottom:16px;font-size:12px;font-weight:600}
.mak-admin .alert-ok{background:var(--ok-soft);border-color:rgba(5,150,105,.22);color:var(--ok)}
.mak-admin .alert-bad{background:var(--bad-soft);border-color:rgba(220,38,38,.22);color:var(--bad)}
.mak-admin .alert-ic{flex-shrink:0;margin-top:1px}
.mak-admin .alert-body{flex:1;min-width:0;line-height:1.45}
.mak-admin .alert-x{border:0;background:transparent;color:currentColor;opacity:.65;padding:2px;display:grid;place-items:center}
.mak-admin .notice{display:flex;gap:11px;padding:13px;border-radius:12px;border:1px solid var(--line);background:var(--surface);font-size:11.5px;color:var(--muted);margin-bottom:16px}
.mak-admin .notice .ic{color:var(--acc);margin-top:1px}
.mak-admin .notice b{color:var(--ink)}
.mak-admin .code-box{display:flex;align-items:center;gap:10px;padding:10px 10px 10px 13px;border-radius:11px;border:1px solid var(--line);background:var(--surface2);min-width:0}
.mak-admin .code-box code{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--ink);word-break:break-all;line-height:1.55}
.mak-admin .code-box.tall{padding:16px}
.mak-admin .code-box.tall code{font-size:15px;letter-spacing:.04em}
.mak-admin .copy-btn{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--muted);font-size:10px;font-weight:800;flex-shrink:0}
.mak-admin .copy-btn:hover{color:var(--ink);border-color:var(--faint)}
.mak-admin .reveal{border-color:rgba(5,150,105,.25);background:var(--surface)}
.mak-admin .detail-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:start}
.mak-admin .kv{display:grid;grid-template-columns:minmax(90px,auto) minmax(0,1fr);gap:8px 16px;font-size:11.5px}
.mak-admin .kv dt{color:var(--muted);font-weight:650}
.mak-admin .kv dd{margin:0;text-align:right;font-weight:700;min-width:0;word-break:break-word}
.mak-admin .meter{height:6px;border-radius:99px;background:var(--surface2);overflow:hidden;border:1px solid var(--line)}
.mak-admin .meter span{display:block;height:100%;border-radius:99px;background:var(--acc)}
.mak-admin .timeline{display:flex;flex-direction:column}
.mak-admin .timeline-item{display:flex;gap:11px;padding:10px 0;border-bottom:1px solid var(--line)}
.mak-admin .timeline-item:last-child{border-bottom:0;padding-bottom:0}
.mak-admin .timeline-dot{width:8px;height:8px;border-radius:99px;background:var(--acc);box-shadow:0 0 0 4px var(--acc-soft);margin-top:5px;flex-shrink:0}
.mak-admin .timeline-dot.bad{background:var(--bad);box-shadow:0 0 0 4px var(--bad-soft)}
.mak-admin .timeline-dot.ok{background:var(--ok);box-shadow:0 0 0 4px var(--ok-soft)}
.mak-admin .timeline-main{flex:1;min-width:0}
.mak-admin .timeline-main b{font-size:11.5px;font-weight:750;display:block}
.mak-admin .timeline-main p{font-size:10.5px;color:var(--muted);margin:2px 0 0;word-break:break-word}
.mak-admin .timeline-time{font-size:9.5px;color:var(--faint);white-space:nowrap;margin-top:1px}
.mak-admin .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:38px 18px;color:var(--muted)}
.mak-admin .empty-ic{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(5,150,105,.2);margin-bottom:11px}
.mak-admin .empty h3{margin:0;font-size:13px;color:var(--ink)}
.mak-admin .empty p{margin:4px 0 0;font-size:11.5px;max-width:360px}
.mak-admin .empty-action{margin-top:13px}
.mak-admin .quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.mak-admin .quick{display:flex;align-items:center;gap:10px;padding:11px;border-radius:11px;border:1px solid var(--line);background:var(--surface)}
.mak-admin .quick:hover{border-color:var(--acc);background:var(--acc-soft)}
.mak-admin .quick .qic{width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(5,150,105,.2);flex-shrink:0}
.mak-admin .quick b{display:block;font-size:11.5px;font-weight:750}
.mak-admin .quick small{display:block;font-size:9.5px;color:var(--muted);margin-top:1px}
.mak-admin .endpoint{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);font-size:11.5px}
.mak-admin .endpoint:last-child{border-bottom:0}
.mak-admin .method{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;font-weight:800;letter-spacing:.06em;padding:3px 6px;border-radius:6px;background:var(--acc-soft);color:var(--acc);border:1px solid rgba(5,150,105,.2);flex-shrink:0}
.mak-admin .endpoint code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--muted);word-break:break-all}
.mak-admin .endpoint .dot-ok{margin-left:auto;color:var(--ok);font-size:9px;font-weight:800;letter-spacing:.08em;white-space:nowrap}
.mak-admin dialog{border:1px solid var(--line);border-radius:16px;background:var(--surface);color:var(--ink);padding:0;width:min(440px,calc(100vw - 32px));box-shadow:0 24px 64px rgba(0,0,0,.25)}
.mak-admin dialog::backdrop{background:rgba(2,4,10,.55)}
.mak-admin .dialog-body{padding:20px}
.mak-admin .dialog-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--bad-soft);color:var(--bad);border:1px solid rgba(220,38,38,.22);margin-bottom:12px}
.mak-admin .dialog-ic.ok{background:var(--acc-soft);color:var(--acc);border-color:rgba(5,150,105,.22)}
.mak-admin .dialog-body h3{margin:0;font-size:16px;letter-spacing:-.02em}
.mak-admin .dialog-body p{margin:6px 0 0;font-size:12px;color:var(--muted)}
.mak-admin .dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.mak-admin .footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:26px 4px 0;color:var(--faint);font-size:10px;font-weight:650}
.mak-admin .fade-up{animation:fadeUp .35s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(max-width:1100px){.mak-admin .grid-4{grid-template-columns:repeat(2,minmax(0,1fr))}.mak-admin .detail-grid{grid-template-columns:1fr}}
@media(max-width:680px){.mak-admin .grid-2,.mak-admin .grid-3,.mak-admin .form-grid{grid-template-columns:1fr}.mak-admin .form-grid .span-2{grid-column:span 1}.mak-admin .page-head h1{font-size:23px}.mak-admin .page-head-actions{width:100%}.mak-admin .page-head-actions .btn{flex:1}.mak-admin .card{padding:16px}.mak-admin .hero-grid{grid-template-columns:1fr}.mak-admin .quick-grid{grid-template-columns:1fr}.mak-admin .toolbar .search{max-width:none;width:100%}.mak-admin .segmented{width:100%}.mak-admin .table-wrap{border:0;background:transparent;overflow:visible}.mak-admin table.tbl{min-width:0;display:block}.mak-admin .tbl thead{display:none}.mak-admin .tbl tbody{display:flex;flex-direction:column;gap:9px}.mak-admin .tbl tr{display:block;border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:11px}.mak-admin .tbl td{display:flex;justify-content:space-between;gap:12px;padding:5px 2px;border:0;text-align:right;min-width:0}.mak-admin .tbl td::before{content:attr(data-label);color:var(--faint);font-size:8.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;text-align:left;flex-shrink:0;padding-top:2px}.mak-admin .tbl td[data-label=""]::before,.mak-admin .tbl td.full::before{display:none}.mak-admin .tbl .actions{justify-content:flex-end}.mak-admin .kv{grid-template-columns:1fr;gap:2px 0}.mak-admin .kv dd{text-align:left}}
`;

export const MAK_ADMIN_JS = `<script>
function copyEl(id,btn){var el=document.getElementById(id);if(!el)return;var text=el.textContent.trim();var done=function(){if(!btn)return;var old=btn.innerHTML;btn.innerHTML='Copied';setTimeout(function(){btn.innerHTML=old},1500)};if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(text).then(done,function(){fallbackCopy(text,done)})}else{fallbackCopy(text,done)}}
function fallbackCopy(text,cb){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy');cb&&cb()}catch(e){}document.body.removeChild(ta)}
function downloadText(id,filename,btn){var el=document.getElementById(id);if(!el)return;var blob=new Blob([el.textContent.trim()],{type:'text/plain'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename||'mak.txt';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},800);if(btn){var old=btn.innerHTML;btn.innerHTML='Downloaded';setTimeout(function(){btn.innerHTML=old},1500)}}
function askConfirm(form,title,message,danger){var d=document.getElementById('confirm-dialog');if(!d){if(confirm(message||title)){form.submit()}return false}window.__makPendingForm=form;document.getElementById('confirm-title').textContent=title||'Confirm action';document.getElementById('confirm-message').textContent=message||'';var ic=document.getElementById('confirm-icon');if(ic){ic.className='dialog-ic '+(danger?'':'ok')}d.showModal();return false}
function confirmYes(){var d=document.getElementById('confirm-dialog');var f=window.__makPendingForm;window.__makPendingForm=null;if(d)d.close();if(f)f.submit()}
function confirmNo(){var d=document.getElementById('confirm-dialog');window.__makPendingForm=null;if(d)d.close()}
</script>`;

export function makAdminContent(content) {
  return '<div class="mak-admin">' + content
    + '<dialog id="confirm-dialog"><div class="dialog-body"><div class="dialog-ic" id="confirm-icon"><i class="bi bi-exclamation-triangle-fill"></i></div><h3 id="confirm-title">Confirm action</h3><p id="confirm-message"></p><div class="dialog-actions"><button class="btn" type="button" onclick="confirmNo()">Cancel</button><button class="btn btn-danger" type="button" onclick="confirmYes()">Confirm</button></div></div></dialog>'
    + '</div>';
}
