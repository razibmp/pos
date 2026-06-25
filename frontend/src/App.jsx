import { useState, useEffect, useCallback } from "react";
import * as API from "./api.js";

const todayStr = () => new Date().toISOString().split("T")[0];
const fmt  = (n) => "৳" + Number(n||0).toLocaleString("en-IN");
const pct  = (a,b) => b>0 ? Math.round((a/b)*100) : 0;

const EXP_CATS = {
  salary:{label:"Salary",icon:"👩‍💼",color:"#EF476F"},office:{label:"Office/Rent",icon:"🏢",color:"#8B5CF6"},
  transport:{label:"Transport",icon:"🚗",color:"#06D6A0"},marketing:{label:"Marketing",icon:"📣",color:"#3B82F6"},
  utilities:{label:"Utilities",icon:"💡",color:"#F59E0B"},packaging:{label:"Packaging",icon:"📦",color:"#FF6B35"},
  misc:{label:"Misc",icon:"📋",color:"#6B7280"},
};
const ROLE_PERMS = {
  Owner:  {tabs:["dashboard","purchases","inventory","sales","expenses","reports","categories","stakeholders","users","deliveries","stock-history","woocommerce","preorders","orders"],seeFinancials:true},
  Manager:{tabs:["dashboard","purchases","inventory","sales","expenses","reports","categories","stakeholders","deliveries","stock-history","woocommerce","preorders","orders"],seeFinancials:true},
  Staff:  {tabs:["sales","inventory"],seeFinancials:false},
};
const SESSION_KEY = "hc_session";
const saveSession  = (u) => { try { localStorage.setItem(SESSION_KEY, JSON.stringify(u)); } catch {} };
const loadSession  = ()  => { try { const s=localStorage.getItem(SESSION_KEY); return s?JSON.parse(s):null; } catch { return null; } };
const clearSession = ()  => { try { localStorage.removeItem(SESSION_KEY); } catch {} };

const css = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;background:#F5F5F7;color:#1D1D1F;-webkit-font-smoothing:antialiased}
@keyframes su{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#C7C7CC;border-radius:4px}
button:active{transform:scale(.98)}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.grid4{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px}
.grid5{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.split31{display:grid;grid-template-columns:3fr 2fr;gap:16px}
.ovx{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
@media(max-width:768px){
  .grid2,.grid3,.grid4,.grid5{grid-template-columns:1fr 1fr}
  .split,.split31{grid-template-columns:1fr}
  .hide-mobile{display:none!important}
  .full-mobile{grid-column:1/-1}
  table{font-size:12px}
  th,td{padding:7px 8px!important}
}
@media(max-width:480px){
  .grid3,.grid4,.grid5{grid-template-columns:1fr 1fr}
}
@media print{
  .no-print{display:none!important}
  body{background:#fff!important;color:#000!important}
  .print-area{padding:0!important}
}
`;

// ── ATOMS ────────────────────────────────────────────────────────────────────
const Toast=({msg,onDone})=>{
  useEffect(()=>{const t=setTimeout(onDone,2800);return()=>clearTimeout(t)},[onDone]);
  return <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",background:"rgba(29,29,31,.92)",backdropFilter:"blur(12px)",color:"#fff",padding:"11px 22px",borderRadius:20,fontWeight:600,fontSize:13,zIndex:9999,boxShadow:"0 4px 24px rgba(0,0,0,.18)",animation:"su .2s ease",whiteSpace:"nowrap",letterSpacing:"-.01em"}}>{msg}</div>;
};
const Card=({children,style})=><div className="card" style={{background:"#fff",borderRadius:18,padding:"18px 20px",boxShadow:"0 1px 3px rgba(0,0,0,.05),0 4px 16px rgba(0,0,0,.04)",border:"1px solid #E5E5EA",...style}}>{children}</div>;
const CT=({children,action})=><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:8}}><div style={{fontSize:15,fontWeight:700,letterSpacing:"-.02em",color:"#1D1D1F"}}>{children}</div>{action&&<div style={{flexShrink:0}}>{action}</div>}</div>;
const SC=({icon,label,value,sub,accent="#FF6B35"})=>(
  <div style={{background:"#fff",borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 3px rgba(0,0,0,.05),0 4px 16px rgba(0,0,0,.04)",border:"1px solid #E5E5EA"}}>
    <div style={{width:32,height:32,borderRadius:10,background:accent+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,marginBottom:10}}>{icon}</div>
    <div style={{fontSize:11,fontWeight:600,color:"#6E6E73",marginBottom:4,letterSpacing:"-.01em"}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:"#1D1D1F",lineHeight:1.1,letterSpacing:"-.03em"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:"#6E6E73",marginTop:4,fontWeight:500}}>{sub}</div>}
  </div>
);
const Bar=({value,max,color})=>{const w=max>0?Math.min(100,(value/max)*100):0;return <div style={{height:5,borderRadius:4,background:"#F2F2F7",overflow:"hidden",flex:1}}><div style={{height:"100%",width:w+"%",background:color||"#FF6B35",borderRadius:4,transition:"width .5s ease"}}/></div>};
const Pill=({children,bg="#F2F2F7",color="#3C3C43"})=><span style={{background:bg,color,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,display:"inline-block",whiteSpace:"nowrap",letterSpacing:"-.01em"}}>{children}</span>;
const FI=({label,...p})=>{
  const [f,sf]=useState(false);
  return <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{fontSize:12,fontWeight:600,color:"#3C3C43",letterSpacing:"-.01em"}}>{label}</label>}
    <input {...p} onFocus={e=>{sf(true);p.onFocus&&p.onFocus(e)}} onBlur={e=>{sf(false);p.onBlur&&p.onBlur(e)}}
      style={{border:(f?"1.5px solid #FF6B35":"1px solid #D2D2D7"),borderRadius:10,padding:"10px 12px",fontFamily:"inherit",fontSize:14,color:"#1D1D1F",background:"#fff",outline:"none",width:"100%",boxShadow:f?"0 0 0 3px rgba(255,107,53,.12)":"none",transition:"border-color .15s,box-shadow .15s",...p.style}}/>
  </div>;
};
const FS=({label,children,...p})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{fontSize:12,fontWeight:600,color:"#3C3C43",letterSpacing:"-.01em"}}>{label}</label>}
    <select {...p} style={{border:"1px solid #D2D2D7",borderRadius:10,padding:"10px 12px",fontFamily:"inherit",fontSize:14,color:"#1D1D1F",background:"#fff",outline:"none",width:"100%",cursor:"pointer",...p.style}}>{children}</select>
  </div>
);
const Btn=({children,variant="primary",...p})=>{
  const v={primary:{background:"#FF6B35",color:"#fff"},secondary:{background:"#F2F2F7",color:"#3C3C43"},danger:{background:"#FFF0EE",color:"#C0392B"}}[variant]||{};
  return <button {...p} style={{border:"none",borderRadius:10,padding:"10px 18px",fontFamily:"inherit",fontSize:14,fontWeight:600,cursor:"pointer",letterSpacing:"-.01em",transition:"opacity .15s",...v,...p.style}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>{children}</button>;
};
const Empty=({msg})=><div style={{textAlign:"center",color:"#AEAEB2",padding:"28px 0",fontSize:13,fontWeight:500}}>{msg}</div>;
const TH=({cols})=><tr style={{borderBottom:"1px solid #F2F2F7"}}>{cols.map((h,i)=><th key={i} style={{textAlign:"left",padding:"9px 12px",fontSize:11,fontWeight:600,color:"#6E6E73",letterSpacing:"-.01em",whiteSpace:"nowrap",background:"#FAFAFA"}}>{h}</th>)}</tr>;

// ── LOGIN ────────────────────────────────────────────────────────────────────
function Login({onLogin}){
  const [un,setUN]=useState("");const [pw,setPW]=useState("");const [err,setErr]=useState("");const [loading,setLoading]=useState(false);
  const submit=async()=>{
    setLoading(true);setErr("");
    try{const u=await API.login({username:un.trim().toLowerCase(),password:pw});onLogin(u);}
    catch(e){setErr(e.message);}
    finally{setLoading(false);}
  };
  return <div style={{minHeight:"100vh",background:"linear-gradient(145deg,#fff5f0 0%,#f0f4ff 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
    <style>{css}</style>
    <div style={{width:"100%",maxWidth:400,animation:"su .35s ease"}}>
      {/* Card */}
      <div style={{background:"#fff",borderRadius:24,overflow:"hidden",boxShadow:"0 4px 6px rgba(0,0,0,.04),0 20px 60px rgba(0,0,0,.1)"}}>
        {/* Brand header */}
        <div style={{background:"linear-gradient(135deg,#FF6B35 0%,#FF8C42 100%)",padding:"36px 32px 32px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:"rgba(255,255,255,.2)",backdropFilter:"blur(8px)",border:"2px solid rgba(255,255,255,.4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,marginBottom:16}}>🎮</div>
          <div style={{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-.02em"}}>The Hobby Center</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,.75)",fontWeight:500,marginTop:5,letterSpacing:".01em"}}>Management Dashboard · Bangladesh</div>
        </div>
        {/* Form */}
        <div style={{padding:"28px 32px 32px"}}>
          <div style={{marginBottom:20,fontSize:15,fontWeight:600,color:"#1D1D1F"}}>Sign in to your account</div>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <FI label="Username" value={un} onChange={e=>{setUN(e.target.value);setErr("")}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Enter username" autoCapitalize="none" autoComplete="username"/>
            <FI label="Password" type="password" value={pw} onChange={e=>{setPW(e.target.value);setErr("")}} onKeyDown={e=>e.key==="Enter"&&submit()} placeholder="Enter password" autoComplete="current-password"/>
            {err&&<div style={{background:"#FEF2F2",color:"#DC2626",borderRadius:10,padding:"10px 14px",fontSize:13,fontWeight:600,textAlign:"center",border:"1px solid #FECACA"}}>⚠️ {err}</div>}
            <button onClick={submit} disabled={loading} style={{width:"100%",fontSize:15,fontWeight:700,padding:"14px",marginTop:2,borderRadius:12,border:"none",cursor:loading?"not-allowed":"pointer",background:"linear-gradient(135deg,#FF6B35,#FF8C42)",color:"#fff",boxShadow:"0 4px 14px rgba(255,107,53,.35)",opacity:loading?.65:1,transition:"opacity .15s,box-shadow .15s",fontFamily:"inherit",letterSpacing:"-.01em"}}>{loading?"Signing in…":"Sign In"}</button>
          </div>
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:20,fontSize:12,color:"#AEAEB2",fontWeight:500}}>© 2025 The Hobby Center · Internal Use Only</div>
    </div>
  </div>;
}

// ── INVOICE MODAL ────────────────────────────────────────────────────────────
function Invoice({sale,onClose}){
  const pn=sale.product_name||sale.productName;
  const printIt=()=>{
    const w=window.open("","_blank","width=320,height=700");if(!w)return;
    const line = (left, right, width=32) => {
      const gap = width - left.length - right.length;
      return left + (gap > 0 ? " ".repeat(gap) : " ") + right;
    };
    const center = (text, width=32) => {
      const pad = Math.max(0, Math.floor((width - text.length) / 2));
      return " ".repeat(pad) + text;
    };
    const dashes = "-".repeat(32);
    const dots = "- ".repeat(16);
    const soldBy = sale.sold_by||sale.soldBy||"";
    const html = `<!DOCTYPE html><html><head><title>${sale.inv}</title><style>
      @media print { @page { margin: 0; size: 80mm auto; } body { margin: 5mm; } .no-print { display: none; } }
      body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #000; background: #fff; max-width: 300px; margin: 0 auto; padding: 10px; }
      pre { margin: 0; white-space: pre-wrap; font-family: 'Courier New', Courier, monospace; font-size: 12px; line-height: 1.5; }
      .big { font-size: 15px; font-weight: bold; }
      .btn { display: block; margin: 16px auto; padding: 8px 24px; background: #FF6B35; color: #fff; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-family: sans-serif; }
    </style></head><body>
    <button class="btn no-print" onclick="window.print()">🖨️ Print</button>
    <pre>
${center("THE HOBBY CENTER")}
${center("Toys · Models · Collectibles")}
${center("Pallabi, Mirpur-12, Dhaka")}
${center("01839000021")}
${dashes}
${line("Invoice :", sale.inv)}
${line("Date    :", sale.date + " " + sale.time)}
${line("Customer:", (sale.customer||"Walk-in").substring(0,20))}
${soldBy ? line("Served  :", soldBy.substring(0,20)) : ""}
${line("Payment :", sale.payment||"Cash")}
${dashes}
${"ITEM".padEnd(20)}${"QTY".padStart(4)}${"PRICE".padStart(8)}
${dots}
${pn.substring(0,20).padEnd(20)}${String(sale.qty).padStart(4)}${("৳"+Number(sale.price).toLocaleString("en-IN")).padStart(8)}
${dots}
${line("Sub Total", "৳"+Number(sale.total).toLocaleString("en-IN"))}
${line("Discount", "৳0")}
${dashes}
${line("GRAND TOTAL", "৳"+Number(sale.total).toLocaleString("en-IN"))}
${dashes}
${line("Payment Method:", sale.payment||"Cash")}
${line("Amount Paid:", "৳"+Number(sale.total).toLocaleString("en-IN"))}
${line("Change Due:", "৳0")}
${dashes}
${center("Thank you for shopping!")}
${center("Please visit again :)")}
${center("fb.com/TheHobbyCenter")}
${dashes}
    </pre>
    </body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(()=>w.print(),400);
  };
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(26,26,46,.6)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,width:"100%",maxWidth:340,boxShadow:"0 20px 60px rgba(0,0,0,.3)",overflow:"hidden",animation:"su .2s ease"}}>
      <div style={{background:"linear-gradient(135deg,#FF6B35,#FF8C42)",padding:"16px 20px",textAlign:"center"}}><div style={{fontSize:28}}>🎮</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:17,fontWeight:800,color:"#fff"}}>The Hobby Center</div><div style={{fontSize:11,color:"rgba(255,255,255,.85)"}}>Sales Receipt</div></div>
      <div style={{padding:"18px 20px"}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#9CA3AF",fontWeight:700,marginBottom:5}}><span>{sale.inv}</span><span>{sale.date} {sale.time}</span></div>
        <div style={{fontSize:13,fontWeight:700}}>Customer: {sale.customer||"Walk-in"}</div>
        {(sale.sold_by||sale.soldBy)&&<div style={{fontSize:11,color:"#9CA3AF",marginBottom:8}}>Served by {sale.sold_by||sale.soldBy}</div>}
        <div style={{borderTop:"1.5px dashed #F0D9C0",borderBottom:"1.5px dashed #F0D9C0",padding:"10px 0",margin:"10px 0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:700,fontSize:14}}>{sale.emoji} {pn}</div><div style={{fontSize:12,color:"#9CA3AF"}}>{sale.qty} × {fmt(sale.price)}</div></div><div style={{fontWeight:800,fontSize:15}}>{fmt(sale.total)}</div></div>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}><div style={{fontFamily:"'Baloo 2',cursive",fontSize:16,fontWeight:800}}>TOTAL</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:22,fontWeight:800,color:"#FF6B35"}}>{fmt(sale.total)}</div></div>
        <div style={{fontSize:12,color:"#9CA3AF",fontWeight:700,marginTop:3}}>Paid via {sale.payment}</div>
        <div style={{display:"flex",gap:10,marginTop:16}}><Btn onClick={printIt} style={{flex:1}}>🖨️ Print</Btn><Btn variant="secondary" onClick={onClose} style={{flex:1}}>Close</Btn></div>
      </div>
    </div>
  </div>;
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({products,sales,expenses,purchases,deliveries,deliveryStats}){
  const td=todayStr();
  const ts=sales.filter(s=>s.date===td),te=expenses.filter(e=>e.date===td);
  // Revenue = product selling price only (delivery charge is separate)
  const walkInSales=ts.filter(s=>s.payment!=="Pathao COD");
  const pathaoSales=ts.filter(s=>s.payment==="Pathao COD");
  const walkInRevenue=walkInSales.reduce((a,s)=>a+(+s.total||0),0);
  const pathaoRevenue=pathaoSales.reduce((a,s)=>a+(+s.total||0),0);
  const revenue=ts.reduce((a,s)=>a+(+s.total||0),0);
  // Delivery charge = separate income (not in product profit)
  const td_deliveries_active=deliveries.filter(d=>d.created_at===td&&d.status!=="cancelled");
  const deliveryIncome=td_deliveries_active.reduce((a,d)=>a+(+d.delivery_charge||0),0);
  const cog=ts.reduce((a,s)=>a+(+s.buy_price||0)*(+s.qty||0),0);
  // Gross profit = revenue - cog (delivery charge excluded)
  const grossRevenue=revenue;
  const gp=grossRevenue-cog,totalExp=te.reduce((a,e)=>a+(+e.amount||0),0);
  const salary=te.filter(e=>e.cat==="salary").reduce((a,e)=>a+(+e.amount||0),0);
  const office=te.filter(e=>e.cat==="office").reduce((a,e)=>a+(+e.amount||0),0);
  const otherE=totalExp-salary-office,net=gp-totalExp,maxB=Math.max(revenue,1);
  const low=products.filter(p=>p.stock<=p.low),pending=purchases.filter(p=>p.status!=="received").length;
  const pendingDeliveries=deliveries.filter(d=>d.status==="pending").length;
  const td_deliveries=deliveries.filter(d=>d.created_at===td&&d.status!=="cancelled");
  const cancelledToday=deliveries.filter(d=>d.created_at===td&&d.status==="cancelled").length;
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid5">
      <SC icon="💰" label="Today Revenue" value={fmt(revenue)} sub={ts.length+" sale(s) + ৳"+deliveryIncome+" delivery"} accent="#FF6B35"/>
      <SC icon="📈" label="Gross Profit" value={fmt(gp)} sub={pct(gp,grossRevenue)+"% margin"} accent="#06D6A0"/>
      <SC icon="🧾" label="Today Expenses" value={fmt(totalExp)} sub={te.length+" item(s)"} accent="#EF476F"/>
      <SC icon="✨" label="Net Profit" value={<span style={{color:net>=0?"#06D6A0":"#EF476F"}}>{fmt(net)}</span>} sub="after all costs" accent="#8B5CF6"/>
      <SC icon="🛵" label="Deliveries" value={pendingDeliveries+" pending"} sub={cancelledToday>0?(cancelledToday+" cancelled today"):(td_deliveries.length+" active today")} accent="#3B82F6"/>
    </div>
    <div className="split31">
      <Card>
        <CT>📊 Today's Breakdown</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {[["Walk-in Sales",walkInRevenue,"#FF6B35"],["Pathao (Product)",pathaoRevenue,"#3B82F6"],["Delivery Income",deliveryIncome,"#06D6A0"],["Cost of Goods",cog,"#FFD166"],["Salary",salary,"#EF476F"],["Office/Rent",office,"#8B5CF6"],["Other Costs",otherE,"#06D6A0"]].map(([l,v,c])=>
            <div key={l} style={{display:"flex",alignItems:"center",gap:10}}><div style={{fontSize:11,fontWeight:700,color:"#6B7280",minWidth:110}}>{l}</div><Bar value={v} max={maxB} color={c}/><div style={{fontSize:12,fontWeight:800,color:"#1A1A2E",minWidth:72,textAlign:"right"}}>{fmt(v)}</div></div>)}
        </div>
        <div style={{marginTop:16,background:"linear-gradient(135deg,#1A1A2E,#2D2D5E)",borderRadius:12,padding:"16px 20px",textAlign:"center"}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.09em",marginBottom:4}}>Net Profit After All Costs</div>
          <div style={{fontFamily:"'Baloo 2',cursive",fontSize:32,fontWeight:800,color:net>=0?"#06D6A0":"#EF476F",lineHeight:1}}>{fmt(net)}</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4}}>{ts.length>0?("Products: "+fmt(gp)+" profit · Delivery: +"+fmt(deliveryIncome)):"No sales today"}</div>
        </div>
      </Card>
      <Card>
        <CT>🛒 Recent Sales</CT>
        {ts.length===0?<Empty msg="No sales yet today"/>:[...ts].reverse().slice(0,7).map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #F9F0E8"}}>
          <div style={{width:30,height:30,borderRadius:8,background:"#FFF8F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,border:"1px solid #F0E6D3"}}>{s.emoji}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.product_name}</div><div style={{fontSize:10,color:"#9CA3AF"}}>x{s.qty} · {s.time}</div></div>
          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontFamily:"'Baloo 2',cursive",fontWeight:800,color:"#FF6B35",fontSize:13}}>{fmt(s.total)}</div><div style={{fontSize:10,color:"#06D6A0",fontWeight:700}}>+{fmt(s.profit)}</div></div>
        </div>)}
      </Card>
    </div>
    <div className="split">
      <Card>
        <CT>⚠️ Low Stock</CT>
        {low.length===0?<Empty msg="All stocked ✅"/>:low.map(p=><div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #F9F0E8"}}>
          <div style={{width:32,height:32,borderRadius:8,background:p.stock===0?"#FEE2E2":"#FEF3C7",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{p.emoji}</div>
          <div style={{flex:1}}><div style={{fontWeight:700,fontSize:12}}>{p.name}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{p.cat}</div></div>
          <Pill bg={p.stock===0?"#FEE2E2":"#FEF3C7"} color={p.stock===0?"#991B1B":"#92400E"}>{p.stock===0?"OUT":"Only "+p.stock}</Pill>
        </div>)}
      </Card>
      <Card>
        <CT>🛵 Recent Deliveries</CT>
        {deliveries.length===0?<Empty msg="No deliveries yet"/>:[...deliveries].slice(0,5).map(d=>{
          const sc={pending:{bg:"#FEF3C7",c:"#92400E"},delivered:{bg:"#D1FAE5",c:"#065F46"},cancelled:{bg:"#FEE2E2",c:"#991B1B"}}[d.status]||{bg:"#F3F4F6",c:"#6B7280"};
          return <div key={d.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #F9F0E8"}}>
            <div style={{width:30,height:30,borderRadius:8,background:"#FFF8F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🛵</div>
            <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.recipient_name}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{d.recipient_phone} · {fmt(d.delivery_charge)} charge</div></div>
            <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:800,color:"#FF6B35",fontSize:12}}>{fmt(d.amount_to_collect)}</div><Pill bg={sc.bg} color={sc.c}>{d.pathao_status||d.status}</Pill></div>
          </div>})}
      </Card>
    </div>
  </div>;
}

// ── INVENTORY ────────────────────────────────────────────────────────────────
function Inventory({products,reload,cats,toast}){
  const blank={name:"",cat:cats[0]?.name||"",buy:"",sell:"",stock:"",low:"5",emoji:"🧸",brand:""};
  const [form,setForm]=useState(blank);const [search,setSearch]=useState("");const [catF,setCatF]=useState("");
  const [editId,setEditId]=useState(null);const [editForm,setEditForm]=useState({});
  const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const add=async()=>{
    if(!form.name.trim()||!form.buy||!form.sell||!form.stock){toast("❌ Fill required fields!");return;}
    await API.addProduct({name:form.name.trim(),cat:form.cat,buy:+form.buy,sell:+form.sell,stock:+form.stock,low:+form.low||5,emoji:form.emoji||"🧸",brand:form.brand||""});
    setForm({...blank,cat:form.cat});reload();toast("✅ Product added!");
  };
  const del=async id=>{await API.deleteProduct(id);reload();toast("🗑️ Deleted")};
  const saveEdit=async()=>{await API.updateProduct(editId,{name:editForm.name,cat:editForm.cat,buy:+editForm.buy,sell:+editForm.sell,stock:+editForm.stock,low:+editForm.low,emoji:editForm.emoji||"🧸",brand:editForm.brand||""});setEditId(null);reload();toast("✅ Updated!")};
  const filtered=products.filter(p=>(!search||p.name.toLowerCase().includes(search.toLowerCase())||(p.brand||"").toLowerCase().includes(search.toLowerCase()))&&(!catF||p.cat===catF));
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="split">
      <Card>
        <CT>➕ Add New Product</CT>
        <div className="grid2" style={{gap:10}}>
          <div style={{gridColumn:"1/-1"}}><FI label="Product Name *" value={form.name} onChange={ff("name")} placeholder="e.g. LEGO City 60303"/></div>
          <FS label="Category" value={form.cat} onChange={ff("cat")}>{cats.map(c=><option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}</FS>
          <FI label="Emoji" value={form.emoji} onChange={ff("emoji")} placeholder="🧸" maxLength={4}/>
          <FI label="Buy Price (৳) *" type="number" value={form.buy} onChange={ff("buy")} placeholder="0"/>
          <FI label="Sell Price (৳) *" type="number" value={form.sell} onChange={ff("sell")} placeholder="0"/>
          <FI label="Stock Qty *" type="number" value={form.stock} onChange={ff("stock")} placeholder="0"/>
          <FI label="Low Stock Alert ≤" type="number" value={form.low} onChange={ff("low")} placeholder="5"/>
          <div style={{gridColumn:"1/-1"}}><FI label="Brand" value={form.brand} onChange={ff("brand")} placeholder="e.g. LEGO, Mattel..."/></div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:12}}><Btn onClick={add}>➕ Add</Btn><Btn variant="secondary" onClick={()=>setForm(blank)}>Clear</Btn></div>
      </Card>
      <div className="grid2">
        <SC icon="📦" label="Products" value={products.length} accent="#FF6B35"/>
        <SC icon="⚠️" label="Low Stock" value={products.filter(p=>p.stock<=p.low).length} accent="#EF476F"/>
        <SC icon="💵" label="Stock Cost" value={fmt(products.reduce((a,p)=>a+p.buy*p.stock,0))} accent="#06D6A0"/>
        <SC icon="🎯" label="Potential Rev." value={fmt(products.reduce((a,p)=>a+p.sell*p.stock,0))} accent="#FFD166"/>
      </div>
    </div>
    <Card>
      <CT>🗂️ Product List ({filtered.length})
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"6px 10px",fontFamily:"'Nunito',sans-serif",fontSize:12,background:"#FFFAF7",outline:"none",width:130}}/>
          <select value={catF} onChange={e=>setCatF(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"6px 10px",fontFamily:"'Nunito',sans-serif",fontSize:12,background:"#FFFAF7",outline:"none"}}><option value="">All</option>{cats.map(c=><option key={c.id} value={c.name}>{c.emoji} {c.name}</option>)}</select>
        </div>
      </CT>
      <div className="ovx"><table>
        <thead><TH cols={["Item","Cat","Buy","Sell","Margin","Stock","Actions"]}/></thead>
        <tbody>
          {filtered.length===0&&<tr><td colSpan={7}><Empty msg="No products found"/></td></tr>}
          {filtered.map(p=>{
            const m=pct(p.sell-p.buy,p.sell);
            const sc=p.stock===0?{bg:"#FEE2E2",c:"#991B1B",t:"Out"}:p.stock<=p.low?{bg:"#FEF3C7",c:"#92400E",t:"Low:"+p.stock}:{bg:"#D1FAE5",c:"#065F46",t:String(p.stock)};
            if(editId===p.id)return <tr key={p.id} style={{background:"#FFF8F0"}}><td colSpan={7} style={{padding:"8px 10px"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"2 1 120px"}}><FI value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} placeholder="Name"/></div>
                <div style={{flex:"1 1 70px"}}><FI type="number" value={editForm.buy} onChange={e=>setEditForm(f=>({...f,buy:e.target.value}))} placeholder="Buy"/></div>
                <div style={{flex:"1 1 70px"}}><FI type="number" value={editForm.sell} onChange={e=>setEditForm(f=>({...f,sell:e.target.value}))} placeholder="Sell"/></div>
                <div style={{flex:"1 1 60px"}}><FI type="number" value={editForm.stock} onChange={e=>setEditForm(f=>({...f,stock:e.target.value}))} placeholder="Stock"/></div>
                <div style={{flex:"1 1 40px"}}><FI value={editForm.emoji} onChange={e=>setEditForm(f=>({...f,emoji:e.target.value}))} maxLength={4}/></div>
                <div style={{display:"flex",gap:6}}><Btn onClick={saveEdit} style={{padding:"8px 12px"}}>💾</Btn><Btn variant="secondary" onClick={()=>setEditId(null)} style={{padding:"8px 12px"}}>✕</Btn></div>
              </div></td></tr>;
            return <tr key={p.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
              <td style={{padding:"9px 10px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:28,height:28,borderRadius:7,background:"#FFF8F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0,border:"1px solid #F0E6D3"}}>{p.emoji}</div><div><div style={{fontWeight:700,fontSize:12}}>{p.name}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{p.brand}</div></div></div></td>
              <td style={{padding:"9px 10px"}}><Pill>{p.cat}</Pill></td>
              <td style={{padding:"9px 10px",fontWeight:700,fontSize:12}}>{fmt(p.buy)}</td>
              <td style={{padding:"9px 10px",fontWeight:700,fontSize:12}}>{fmt(p.sell)}</td>
              <td style={{padding:"9px 10px"}}><span style={{fontWeight:800,fontSize:12,color:m>30?"#06D6A0":m>15?"#FF6B35":"#EF476F"}}>{m}%</span></td>
              <td style={{padding:"9px 10px"}}><Pill bg={sc.bg} color={sc.c}>{sc.t}</Pill></td>
              <td style={{padding:"9px 10px"}}><div style={{display:"flex",gap:5}}><button onClick={()=>{setEditId(p.id);setEditForm({...p})}} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:6,padding:"5px 8px",fontSize:12,cursor:"pointer"}}>✏️</button><button onClick={()=>del(p.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"5px 8px",fontSize:12,cursor:"pointer"}}>🗑️</button></div></td>
            </tr>;
          })}
        </tbody>
      </table></div>
    </Card>
  </div>;
}

// ── SALES ────────────────────────────────────────────────────────────────────
function Sales({products,sales,reload,perms,user,toast}){
  const [editSale,setEditSale]=useState(null);
  const [editForm,setEditForm]=useState({});
  const seeFin=perms?.seeFinancials!==false;
  const blank={productId:"",qty:"1",price:"",customer:"",payment:"Cash"};
  const [form,setForm]=useState(blank);const [invoice,setInvoice]=useState(null);
  const selP=products.find(p=>String(p.id)===String(form.productId));
  const qty=Math.max(1,+form.qty||1),price=+form.price||0;
  const total=qty*price,profit=selP?qty*(price-selP.buy):0,margin=pct(profit,total);
  const handleProd=e=>{const pid=e.target.value;const p=products.find(x=>String(x.id)===pid);setForm(prev=>({...prev,productId:pid,price:p?String(p.sell):""}))};
  const record=async()=>{
    if(!selP||!form.qty||!form.price){toast("❌ Fill fields!");return;}
    if(selP.stock<qty){toast("❌ Not enough stock!");return;}
    const s={inv:"INV-"+String(Date.now()).slice(-6),date:todayStr(),time:new Date().toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit"}),productId:selP.id,productName:selP.name,emoji:selP.emoji,qty,price,buyPrice:selP.buy,total,profit,customer:form.customer||"Walk-in",payment:form.payment,soldBy:user?.name||""};
    const saved=await API.addSale(s);setInvoice({...s,...saved,product_name:selP.name});
    setForm(prev=>({...prev,qty:"1",customer:"",price:String(selP.sell)}));reload();
    toast(seeFin?"✅ Profit: "+fmt(profit):"✅ Sale recorded!");
  };
  const delSale=async(id)=>{
    if(!window.confirm("Delete this sale? Stock will be restored."))return;
    await API.deleteSale(id);reload();toast("🗑️ Sale deleted");
  };
  const saveEdit=async()=>{
    const total=(+editForm.qty)*(+editForm.price);
    const profit=total-(+editForm.buy_price||0)*(+editForm.qty);
    await API.updateSale(editSale,{...editForm,total,profit});
    setEditSale(null);reload();toast("✅ Sale updated!");
  };
  const td=todayStr(),ts=sales.filter(s=>s.date===td);
  const rev=ts.reduce((a,s)=>a+s.total,0),gp=ts.reduce((a,s)=>a+s.profit,0);
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    {invoice&&<Invoice sale={invoice} onClose={()=>setInvoice(null)}/>}
    <div className="split">
      <Card>
        <CT>🛒 Record a Sale</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <FS label="Product *" value={form.productId} onChange={handleProd}><option value="">— Select Product —</option>{products.map(p=><option key={p.id} value={p.id}>{p.emoji} {p.name} (stock: {p.stock})</option>)}</FS>
          <div className="grid2" style={{gap:10}}>
            <FI label="Qty *" type="number" min="1" value={form.qty} onChange={e=>setForm(p=>({...p,qty:e.target.value}))}/>
            <FI label="Price (৳)" type="number" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))} placeholder="Auto-fill"/>
            <FI label="Customer" value={form.customer} onChange={e=>setForm(p=>({...p,customer:e.target.value}))} placeholder="Walk-in"/>
            <FS label="Payment" value={form.payment} onChange={e=>setForm(p=>({...p,payment:e.target.value}))}>{["Cash","bKash","Nagad","Card","Bank Transfer"].map(x=><option key={x}>{x}</option>)}</FS>
          </div>
        </div>
        {selP&&form.price&&<div style={{background:"#FFF8F0",border:"1.5px solid #F0D9C0",borderRadius:11,padding:12,marginTop:12,display:"grid",gridTemplateColumns:seeFin?"1fr 1fr 1fr":"1fr",gap:8,textAlign:"center"}}>
          {(seeFin?[["TOTAL",fmt(total),"#FF6B35"],["PROFIT",fmt(profit),profit>=0?"#06D6A0":"#EF476F"],["MARGIN",margin+"%","#6B7280"]]:[["TOTAL",fmt(total),"#FF6B35"]]).map(([l,v,c])=><div key={l}><div style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase"}}>{l}</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:20,fontWeight:800,color:c}}>{v}</div></div>)}
        </div>}
        <div style={{display:"flex",gap:10,marginTop:12}}><Btn onClick={record}>✅ Record Sale</Btn><Btn variant="secondary" onClick={()=>setForm(blank)}>Clear</Btn></div>
      </Card>
      <Card>
        <CT>📅 Today ({ts.length})</CT>
        <div className="grid2" style={{marginBottom:14}}>
          <div style={{background:"#FFF8F0",borderRadius:11,padding:12,textAlign:"center",border:"1.5px solid #F0D9C0"}}><div style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase"}}>Revenue</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:20,fontWeight:800,color:"#FF6B35"}}>{fmt(rev)}</div></div>
          {seeFin&&<div style={{background:"#F0FFF8",borderRadius:11,padding:12,textAlign:"center",border:"1.5px solid #BBF7D0"}}><div style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase"}}>Gross Profit</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:20,fontWeight:800,color:"#06D6A0"}}>{fmt(gp)}</div></div>}
        </div>
        {ts.length===0?<Empty msg="No sales today"/>:[...ts].reverse().slice(0,5).map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:"1px solid #F9F0E8"}}>
          <div style={{fontSize:18,flexShrink:0}}>{s.emoji}</div>
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.product_name} x{s.qty}</div><div style={{fontSize:10,color:"#9CA3AF"}}>{s.time} · {s.payment}</div></div>
          <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:800,color:"#FF6B35",fontSize:13}}>{fmt(s.total)}</div>{seeFin&&<div style={{fontSize:10,color:"#06D6A0",fontWeight:700}}>+{fmt(s.profit)}</div>}</div>
        </div>)}
      </Card>
    </div>
    {editSale&&<div onClick={()=>setEditSale(null)} style={{position:"fixed",inset:0,background:"rgba(26,26,46,.55)",zIndex:9998,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:18,padding:"24px",width:"100%",maxWidth:480,boxShadow:"0 20px 60px rgba(0,0,0,.3)"}}>
        <div style={{fontFamily:"'Baloo 2',cursive",fontSize:16,fontWeight:800,marginBottom:16}}>✏️ Edit Sale</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <FI label="Product Name" value={editForm.product_name||""} onChange={e=>setEditForm(p=>({...p,product_name:e.target.value}))}/>
          <div className="grid2" style={{gap:10}}>
            <FI label="Qty" type="number" value={editForm.qty||""} onChange={e=>setEditForm(p=>({...p,qty:e.target.value}))}/>
            <FI label="Price (৳)" type="number" value={editForm.price||""} onChange={e=>setEditForm(p=>({...p,price:e.target.value}))}/>
            <FI label="Customer" value={editForm.customer||""} onChange={e=>setEditForm(p=>({...p,customer:e.target.value}))}/>
            <FS label="Payment" value={editForm.payment||"Cash"} onChange={e=>setEditForm(p=>({...p,payment:e.target.value}))}>
              {["Cash","bKash","Nagad","Card","Bank Transfer","Cash on delivery","WooCommerce"].map(x=><option key={x}>{x}</option>)}
            </FS>
            <FI label="Date" type="date" value={editForm.date||""} onChange={e=>setEditForm(p=>({...p,date:e.target.value}))}/>
          </div>
          {editForm.qty&&editForm.price&&<div style={{background:"#FFF8F0",borderRadius:10,padding:12,textAlign:"center",border:"1.5px solid #F0D9C0"}}>
            <span style={{fontWeight:700,color:"#9CA3AF",fontSize:12}}>Total: </span>
            <span style={{fontFamily:"'Baloo 2',cursive",fontSize:20,fontWeight:800,color:"#FF6B35"}}>{fmt((+editForm.qty)*(+editForm.price))}</span>
          </div>}
        </div>
        <div style={{display:"flex",gap:10,marginTop:16}}>
          <Btn onClick={saveEdit} style={{flex:1}}>💾 Save</Btn>
          <Btn variant="secondary" onClick={()=>setEditSale(null)} style={{flex:1}}>Cancel</Btn>
        </div>
      </div>
    </div>}
    <Card>
      <CT>📋 Sales History ({sales.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={seeFin?["Date","Product","Qty","Price","Total","Profit","Pay","Customer","Inv.","Actions"]:["Date","Product","Qty","Price","Total","Pay","Inv.","Actions"]}/></thead>
        <tbody>
          {sales.length===0&&<tr><td colSpan={9}><Empty msg="No sales yet"/></td></tr>}
          {sales.map(s=><tr key={s.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11}}>{s.date}</td>
            <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{s.emoji} {s.product_name}</td>
            <td style={{padding:"8px 10px"}}>{s.qty}</td>
            <td style={{padding:"8px 10px"}}>{fmt(s.price)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(s.total)}</td>
            {seeFin&&<td style={{padding:"8px 10px",fontWeight:800,color:s.profit>=0?"#06D6A0":"#EF476F"}}>{fmt(s.profit)}</td>}
            <td style={{padding:"8px 10px"}}><Pill bg={s.payment==="Pathao COD"?"#FFF3ED":"#DBEAFE"} color={s.payment==="Pathao COD"?"#FF6B35":"#1E40AF"}>{s.payment==="Pathao COD"?"🛵 Pathao":s.payment}</Pill></td>
            {seeFin&&<td style={{padding:"8px 10px",color:"#6B7280",fontSize:11}}>{s.customer}</td>}
            <td style={{padding:"8px 10px"}}><button onClick={()=>setInvoice(s)} style={{background:"#FFF3ED",color:"#FF6B35",border:"1px solid #FFD9C7",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:700,cursor:"pointer"}}>🧾</button></td>
            <td style={{padding:"8px 10px"}}>
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>{setEditSale(s.id);setEditForm({...s});}} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>✏️</button>
                <button onClick={()=>delSale(s.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>🗑️</button>
              </div>
            </td>
          </tr>)}
        </tbody>
      </table></div>
    </Card>
  </div>;
}

// ── EXPENSES ─────────────────────────────────────────────────────────────────
function Expenses({expenses,reload,toast}){
  const blank={name:"",cat:"salary",amount:"",date:todayStr(),notes:""};
  const [form,setForm]=useState(blank);const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const add=async()=>{if(!form.name.trim()||!form.amount){toast("❌ Fill fields!");return;}await API.addExpense({name:form.name.trim(),cat:form.cat,amount:+form.amount,date:form.date||todayStr(),notes:form.notes||""});setForm(blank);reload();toast("✅ Logged!")};
  const del=async id=>{await API.deleteExpense(id);reload();toast("🗑️ Deleted")};
  const te=expenses.filter(e=>e.date===todayStr()),tot=te.reduce((a,e)=>a+e.amount,0);
  const bc={};te.forEach(e=>{bc[e.cat]=(bc[e.cat]||0)+e.amount});
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="split">
      <Card>
        <CT>➕ Log Expense</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <FI label="Name *" value={form.name} onChange={ff("name")} placeholder="e.g. Salary, Rent..."/>
          <div className="grid2" style={{gap:10}}>
            <FS label="Category" value={form.cat} onChange={ff("cat")}>{Object.entries(EXP_CATS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</FS>
            <FI label="Amount (৳) *" type="number" value={form.amount} onChange={ff("amount")} placeholder="0"/>
            <FI label="Date" type="date" value={form.date} onChange={ff("date")}/>
            <FI label="Notes" value={form.notes} onChange={ff("notes")} placeholder="Optional..."/>
          </div>
        </div>
        <div style={{display:"flex",gap:10,marginTop:12}}><Btn onClick={add}>➕ Add</Btn><Btn variant="secondary" onClick={()=>setForm(blank)}>Clear</Btn></div>
      </Card>
      <Card>
        <CT>📊 Today {tot>0&&<span style={{fontFamily:"'Baloo 2',cursive",color:"#EF476F",fontSize:16,fontWeight:800}}>{fmt(tot)}</span>}</CT>
        {Object.keys(bc).length===0?<Empty msg="No expenses today"/>:Object.entries(bc).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{const ci=EXP_CATS[cat]||EXP_CATS.misc;return <div key={cat} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginBottom:4}}><span>{ci.icon} {ci.label}</span><span style={{color:"#EF476F"}}>{fmt(amt)}</span></div><Bar value={amt} max={tot} color={ci.color}/></div>})}
      </Card>
    </div>
    <Card>
      <CT>📋 History ({expenses.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={["Date","Name","Category","Amount","Notes",""]}/></thead>
        <tbody>
          {expenses.length===0&&<tr><td colSpan={6}><Empty msg="No expenses yet"/></td></tr>}
          {expenses.map(e=>{const ci=EXP_CATS[e.cat]||EXP_CATS.misc;return <tr key={e.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={ev=>ev.currentTarget.style.background="#FFF8F0"} onMouseLeave={ev=>ev.currentTarget.style.background=""}>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11}}>{e.date}</td>
            <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{e.name}</td>
            <td style={{padding:"8px 10px"}}><Pill bg={ci.color+"22"} color={ci.color}>{ci.icon} {ci.label}</Pill></td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#EF476F"}}>{fmt(e.amount)}</td>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11}}>{e.notes||"—"}</td>
            <td style={{padding:"8px 10px"}}><button onClick={()=>del(e.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>🗑️</button></td>
          </tr>})}
        </tbody>
      </table></div>
    </Card>
  </div>;
}

// ── PURCHASES ────────────────────────────────────────────────────────────────
function Purchases({purchases,products,reload,toast}){
  const blank={supplierName:"",orderDate:todayStr(),status:"pending",productCostBDT:"",chinaShippingBDT:"",cnfBDT:"",customsDutyBDT:"",vatBDT:"",agentFeesBDT:"",localTransportBDT:"",otherBDT:"",notes:"",items:[{productId:"",qty:""}]};
  const [form,setForm]=useState(blank);const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const calc=f=>{const a=+f.productCostBDT||0,b=+f.chinaShippingBDT||0,c=+f.cnfBDT||0,d=+f.customsDutyBDT||0,e=+f.vatBDT||0,g=+f.agentFeesBDT||0,h=+f.localTransportBDT||0,j=+f.otherBDT||0;const tot=a+b+c+d+e+g+h+j;const tq=f.items.reduce((s,i)=>s+(+i.qty||0),0);return{totalLanded:tot,totalQty:tq,costPerUnit:tq>0?tot/tq:0,productCostBDT:a,chinaShippingBDT:b,cnfBDT:c,customsDutyBDT:d,vatBDT:e,agentFeesBDT:g,localTransportBDT:h,otherBDT:j}};
  const cc=calc(form);
  const addItem=()=>setForm(p=>({...p,items:[...p.items,{productId:"",qty:""}]}));
  const rmItem=i=>setForm(p=>({...p,items:p.items.filter((_,idx)=>idx!==i)}));
  const upItem=(i,k,v)=>setForm(p=>({...p,items:p.items.map((it,idx)=>idx===i?{...it,[k]:v}:it)}));
  const submit=async()=>{
    if(!form.supplierName.trim()){toast("❌ Enter supplier!");return;}
    const vi=form.items.filter(i=>i.productId&&+i.qty>0);if(!vi.length){toast("❌ Add items!");return;}
    await API.addPurchase({...form,items:vi.map(i=>({productId:+i.productId,qty:+i.qty})),...cc});
    setForm(blank);reload();toast("✅ PO created!");
  };
  const setStatus=async(id,s)=>{await API.updatePurchaseStatus(id,s);reload();toast(s==="received"?"✅ Stock updated!":"✅ Status updated!")};
  const stC={pending:{bg:"#FEF3C7",c:"#92400E"},transit:{bg:"#DBEAFE",c:"#1E40AF"},customs:{bg:"#EDE9FE",c:"#5B21B6"},received:{bg:"#D1FAE5",c:"#065F46"}};
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid4">
      <SC icon="🚢" label="Total POs" value={purchases.length} accent="#3B82F6"/>
      <SC icon="⏳" label="Open" value={purchases.filter(p=>p.status!=="received").length} accent="#F59E0B"/>
      <SC icon="💸" label="Total Landed" value={fmt(purchases.reduce((a,p)=>a+(p.total_landed||0),0))} accent="#EF476F"/>
      <SC icon="✅" label="Received" value={purchases.filter(p=>p.status==="received").length} accent="#06D6A0"/>
    </div>
    <div className="split">
      <Card>
        <CT>📦 New Purchase Order</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <div className="grid2" style={{gap:10}}>
            <FI label="Supplier *" value={form.supplierName} onChange={ff("supplierName")} placeholder="e.g. Guangzhou Toys"/>
            <FI label="Date" type="date" value={form.orderDate} onChange={ff("orderDate")}/>
          </div>
          <FS label="Status" value={form.status} onChange={ff("status")}><option value="pending">⏳ Pending</option><option value="transit">🚢 Transit</option><option value="customs">🏛️ Customs</option><option value="received">✅ Received</option></FS>
          <div style={{background:"#FFF8F0",borderRadius:11,padding:12,border:"1.5px solid #F0D9C0"}}>
            <div style={{fontSize:10,fontWeight:800,color:"#FF6B35",textTransform:"uppercase",marginBottom:8}}>🇨🇳 Supplier Costs (৳)</div>
            <div className="grid2" style={{gap:8,marginBottom:10}}>
              <FI label="Product Cost" type="number" value={form.productCostBDT} onChange={ff("productCostBDT")} placeholder="0"/>
              <FI label="China Shipping" type="number" value={form.chinaShippingBDT} onChange={ff("chinaShippingBDT")} placeholder="0"/>
            </div>
            <div style={{fontSize:10,fontWeight:800,color:"#8B5CF6",textTransform:"uppercase",marginBottom:8}}>🇧🇩 BD Import Costs (৳)</div>
            <div className="grid2" style={{gap:8}}>
              <FI label="C&F" type="number" value={form.cnfBDT} onChange={ff("cnfBDT")} placeholder="0"/>
              <FI label="Customs" type="number" value={form.customsDutyBDT} onChange={ff("customsDutyBDT")} placeholder="0"/>
              <FI label="VAT" type="number" value={form.vatBDT} onChange={ff("vatBDT")} placeholder="0"/>
              <FI label="Agent Fees" type="number" value={form.agentFeesBDT} onChange={ff("agentFeesBDT")} placeholder="0"/>
              <FI label="Transport" type="number" value={form.localTransportBDT} onChange={ff("localTransportBDT")} placeholder="0"/>
              <FI label="Other" type="number" value={form.otherBDT} onChange={ff("otherBDT")} placeholder="0"/>
            </div>
          </div>
          <div>
            <div style={{fontSize:10,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",marginBottom:8}}>Items</div>
            {form.items.map((item,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr auto",gap:8,marginBottom:8}}>
              <FS value={item.productId} onChange={e=>upItem(i,"productId",e.target.value)}><option value="">— Product —</option>{products.map(p=><option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}</FS>
              <FI type="number" value={item.qty} onChange={e=>upItem(i,"qty",e.target.value)} placeholder="Qty"/>
              <button onClick={()=>rmItem(i)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:8,padding:"9px 10px",cursor:"pointer",fontWeight:800}}>✕</button>
            </div>)}
            <button onClick={addItem} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:8,padding:"7px 14px",cursor:"pointer",fontWeight:700,fontSize:12}}>+ Add Row</button>
          </div>
          <FI label="Notes" value={form.notes} onChange={ff("notes")} placeholder="Ref number..."/>
        </div>
        <Btn onClick={submit} style={{width:"100%",marginTop:12}}>📦 Create PO</Btn>
      </Card>
      <Card>
        <CT>🧮 Landed Cost</CT>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          {[["Product",cc.productCostBDT,"#FF6B35"],["China Ship",cc.chinaShippingBDT,"#F59E0B"],["C&F",cc.cnfBDT,"#3B82F6"],["Customs",cc.customsDutyBDT,"#8B5CF6"],["VAT",cc.vatBDT,"#EC4899"],["Agent",cc.agentFeesBDT,"#06D6A0"],["Transport",cc.localTransportBDT,"#10B981"],["Other",cc.otherBDT,"#6B7280"]].map(([l,v,c])=>
            <div key={l} style={{display:"flex",alignItems:"center",gap:8}}><div style={{fontSize:11,fontWeight:600,color:"#6B7280",flex:1}}>{l}</div><Bar value={v} max={Math.max(cc.totalLanded,1)} color={c}/><div style={{fontSize:11,fontWeight:800,minWidth:70,textAlign:"right"}}>{fmt(v)}</div></div>)}
          <div style={{borderTop:"2px dashed #F0D9C0",paddingTop:12,marginTop:4}}>
            <div style={{background:"linear-gradient(135deg,#1A1A2E,#2D2D5E)",borderRadius:12,padding:"14px 16px",textAlign:"center"}}>
              <div style={{fontSize:9,color:"rgba(255,255,255,.6)",fontWeight:700,textTransform:"uppercase",marginBottom:3}}>Total Landed</div>
              <div style={{fontFamily:"'Baloo 2',cursive",fontSize:28,fontWeight:800,color:"#FFD166"}}>{fmt(cc.totalLanded)}</div>
              {cc.totalQty>0&&<div className="grid2" style={{gap:8,marginTop:10}}>
                <div style={{background:"rgba(255,255,255,.08)",borderRadius:9,padding:8,textAlign:"center"}}><div style={{fontSize:9,color:"rgba(255,255,255,.5)",textTransform:"uppercase",fontWeight:700}}>Units</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:18,fontWeight:800,color:"#fff"}}>{cc.totalQty}</div></div>
                <div style={{background:"rgba(255,255,255,.08)",borderRadius:9,padding:8,textAlign:"center"}}><div style={{fontSize:9,color:"rgba(255,255,255,.5)",textTransform:"uppercase",fontWeight:700}}>Per Unit</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:18,fontWeight:800,color:"#06D6A0"}}>{fmt(Math.round(cc.costPerUnit))}</div></div>
              </div>}
            </div>
          </div>
        </div>
      </Card>
    </div>
    <Card>
      <CT>📋 PO History ({purchases.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={["Date","Supplier","Landed","Per Unit","Status","Action"]}/></thead>
        <tbody>
          {purchases.length===0&&<tr><td colSpan={6}><Empty msg="No POs yet"/></td></tr>}
          {purchases.map(po=>{const s=stC[po.status]||{bg:"#F3F4F6",c:"#6B7280"};const st={pending:"⏳ Pending",transit:"🚢 Transit",customs:"🏛️ Customs",received:"✅ Done"}[po.status]||po.status;
          return <tr key={po.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11}}>{po.order_date}</td>
            <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{po.supplier_name}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#3B82F6"}}>{fmt(po.total_landed)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#06D6A0"}}>{fmt(Math.round(po.cost_per_unit||0))}</td>
            <td style={{padding:"8px 10px"}}><Pill bg={s.bg} color={s.c}>{st}</Pill></td>
            <td style={{padding:"8px 10px"}}>{po.status!=="received"?<select value={po.status} onChange={e=>setStatus(po.id,e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:7,padding:"4px 7px",fontSize:11,fontFamily:"'Nunito',sans-serif",background:"#FFFAF7",outline:"none",cursor:"pointer"}}><option value="pending">⏳</option><option value="transit">🚢</option><option value="customs">🏛️</option><option value="received">✅ Received</option></select>:<span style={{fontSize:11,color:"#06D6A0",fontWeight:700}}>✓ Done</span>}</td>
          </tr>})}
        </tbody>
      </table></div>
    </Card>
  </div>;
}

// ── REPORTS ──────────────────────────────────────────────────────────────────
function Reports({products,sales,expenses,purchases,dark}){
  const printReport=()=>{
    const w=window.open("","_blank","width=800,height=600");
    if(!w)return;
    const td=new Date().toLocaleDateString("en-BD",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const allRev=sales.reduce((a,s)=>a+(+s.total||0),0);
    const allGP=sales.reduce((a,s)=>a+(+s.profit||0),0);
    const allExp=expenses.reduce((a,e)=>a+(+e.amount||0),0);
    const net=allGP-allExp;
    const walkIn=sales.filter(s=>s.payment!=="Pathao COD").reduce((a,s)=>a+(+s.total||0),0);
    const pathao=sales.filter(s=>s.payment==="Pathao COD").reduce((a,s)=>a+(+s.total||0),0);
    const fmtN=n=>"৳"+Number(n||0).toLocaleString("en-IN");
    const pm={};sales.forEach(s=>{const n=s.product_name;if(!pm[n])pm[n]={qty:0,rev:0,profit:0};pm[n].qty+=s.qty;pm[n].rev+=(+s.total||0);pm[n].profit+=(+s.profit||0);});
    const top=Object.entries(pm).sort((a,b)=>b[1].rev-a[1].rev).slice(0,10);
    const expCats={};expenses.forEach(e=>{expCats[e.cat]=(expCats[e.cat]||0)+(+e.amount||0);});
    const topRows=top.map(([n,d],i)=>"<tr><td>"+(i+1)+"</td><td>"+n+"</td><td>"+d.qty+"</td><td><b>"+fmtN(d.rev)+"</b></td><td style='color:#06D6A0'><b>"+fmtN(d.profit)+"</b></td><td>"+(d.rev>0?Math.round((d.profit/d.rev)*100):0)+"%</td></tr>").join("");
    const expRows=Object.entries(expCats).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>"<tr><td>"+cat+"</td><td><b>"+fmtN(amt)+"</b></td><td>"+(allExp>0?Math.round((amt/allExp)*100):0)+"%</td></tr>").join("");
    const html="<!DOCTYPE html><html><head><title>THC Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#1A1A2E;max-width:800px;margin:0 auto}h1{color:#FF6B35;margin:0}h2{font-size:15px;margin:16px 0 8px;color:#1A1A2E;border-bottom:2px solid #F0D9C0;padding-bottom:4px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}.kpi{background:#FFF8F0;border-radius:10px;padding:12px;border:1.5px solid #F0D9C0;text-align:center}.kpi-l{font-size:10px;color:#9CA3AF;font-weight:700;text-transform:uppercase;margin-bottom:4px}.kpi-v{font-size:20px;font-weight:800}.green{color:#06D6A0}.red{color:#EF476F}.orange{color:#FF6B35}table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px}th{background:#FFF8F0;padding:7px 10px;text-align:left;font-size:10px;color:#9CA3AF;text-transform:uppercase;font-weight:800}td{padding:7px 10px;border-bottom:1px solid #F9F0E8}.footer{margin-top:24px;text-align:center;font-size:11px;color:#9CA3AF;border-top:1px solid #F0D9C0;padding-top:12px}</style></head><body>"
      +"<div style='display:flex;align-items:center;gap:12px;margin-bottom:16px'><span style='font-size:36px'>🎮</span><div><h1>The Hobby Center</h1><div style='font-size:12px;color:#9CA3AF'>"+td+" — All Time Report</div></div><div style='margin-left:auto;font-size:11px;color:#9CA3AF'>Printed: "+new Date().toLocaleString("en-BD")+"</div></div>"
      +"<h2>📊 Financial Summary</h2><div class='grid'>"
      +"<div class='kpi'><div class='kpi-l'>Total Revenue</div><div class='kpi-v orange'>"+fmtN(allRev)+"</div></div>"
      +"<div class='kpi'><div class='kpi-l'>Gross Profit</div><div class='kpi-v "+(allGP>=0?"green":"red")+"'>"+fmtN(allGP)+"</div></div>"
      +"<div class='kpi'><div class='kpi-l'>Total Expenses</div><div class='kpi-v red'>"+fmtN(allExp)+"</div></div>"
      +"<div class='kpi'><div class='kpi-l'>Net Profit</div><div class='kpi-v "+(net>=0?"green":"red")+"'>"+fmtN(net)+"</div></div></div>"
      +"<div class='grid' style='grid-template-columns:1fr 1fr'><div class='kpi'><div class='kpi-l'>Walk-in Sales</div><div class='kpi-v orange'>"+fmtN(walkIn)+"</div></div><div class='kpi'><div class='kpi-l'>Pathao COD</div><div class='kpi-v'>"+fmtN(pathao)+"</div></div></div>"
      +"<h2>🏆 Top Products</h2><table><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th></tr>"+topRows+"</table>"
      +"<h2>💸 Expense Breakdown</h2><table><tr><th>Category</th><th>Amount</th><th>% of Total</th></tr>"+expRows+"</table>"
      +"<div class='footer'>🎮 The Hobby Center · mgt.hobbycenterbd.com · Generated "+new Date().toLocaleString("en-BD")+"</div>"
      +"</body></html>";
    w.document.write(html);    w.document.close();w.focus();setTimeout(()=>w.print(),400);
  };
  const [range,setRange]=useState("all");const [from,setFrom]=useState("");const [to,setTo]=useState("");
  const inR=d=>{if(range==="all")return true;const dt=new Date(d),now=new Date();now.setHours(23,59,59);if(range==="today")return d===todayStr();if(range==="7d"){const s=new Date();s.setDate(s.getDate()-6);s.setHours(0,0,0);return dt>=s&&dt<=now}if(range==="30d"){const s=new Date();s.setDate(s.getDate()-29);s.setHours(0,0,0);return dt>=s&&dt<=now}if(range==="month"){const s=new Date(now.getFullYear(),now.getMonth(),1);return dt>=s&&dt<=now}if(range==="custom")return(!from||dt>=new Date(from))&&(!to||dt<=new Date(to+"T23:59:59"));return true};
  const fS=sales.filter(s=>inR(s.date)),fE=expenses.filter(e=>inR(e.date));
  const allRev=fS.reduce((a,s)=>a+(+s.total||0),0),allGP=fS.reduce((a,s)=>a+(+s.profit||0),0),allExp=fE.reduce((a,e)=>a+(+e.amount||0),0),net=allGP-allExp;
  const pm={};fS.forEach(s=>{const n=s.product_name;if(!pm[n])pm[n]={qty:0,rev:0,profit:0,emoji:s.emoji};pm[n].qty+=s.qty;pm[n].rev+=s.total;pm[n].profit+=s.profit});
  const top=Object.entries(pm).sort((a,b)=>b[1].rev-a[1].rev).slice(0,8);const maxR=top[0]?top[0][1].rev:1;
  const bc={};fE.forEach(e=>{bc[e.cat]=(bc[e.cat]||0)+e.amount});const maxE=Math.max(...Object.values(bc),1);
  const RANGES=[["today","Today"],["7d","7 Days"],["30d","30 Days"],["month","This Month"],["all","All Time"],["custom","Custom"]];
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginBottom:-8}}><Btn onClick={printReport} variant="secondary">🖨️ Print Report</Btn></div>
    <Card style={{padding:"12px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase"}}>📅</span>
        {RANGES.map(([id,lbl])=><button key={id} onClick={()=>setRange(id)} style={{border:"1.5px solid",borderColor:range===id?"#FF6B35":"#F0D9C0",background:range===id?"#FF6B35":"#FFFAF7",color:range===id?"#fff":"#6B7280",borderRadius:18,padding:"5px 12px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>{lbl}</button>)}
        {range==="custom"&&<div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"'Nunito',sans-serif",background:"#FFFAF7",outline:"none"}}/>
          <span style={{color:"#9CA3AF",fontWeight:700}}>→</span>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"'Nunito',sans-serif",background:"#FFFAF7",outline:"none"}}/>
        </div>}
        <span style={{marginLeft:"auto",fontSize:11,color:"#9CA3AF",fontWeight:700}}>{fS.length} sale(s)</span>
      </div>
    </Card>
    <div className="grid5">
      <SC icon="💰" label="Revenue" value={fmt(allRev)} accent="#FF6B35"/>
      <SC icon="📈" label="Gross Profit" value={fmt(allGP)} accent="#06D6A0"/>
      <SC icon="🧾" label="Expenses" value={fmt(allExp)} accent="#EF476F"/>
      <SC icon="🚢" label="Landed" value={fmt(purchases.reduce((a,p)=>a+(p.total_landed||0),0))} accent="#3B82F6"/>
      <SC icon="✨" label="Net Profit" value={<span style={{color:net>=0?"#06D6A0":"#EF476F"}}>{fmt(net)}</span>} accent="#8B5CF6"/>
    </div>
    <div className="split">
      <Card><CT>🏆 Top Products</CT>{top.length===0?<Empty msg="No data"/>:top.map(([n,d],i)=><div key={n} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginBottom:4}}><span><span style={{fontFamily:"'Baloo 2',cursive",color:"#FF6B35",marginRight:5}}>#{i+1}</span>{d.emoji} {n} <span style={{color:"#9CA3AF"}}>x{d.qty}</span></span><span style={{color:"#FF6B35"}}>{fmt(d.rev)}</span></div><Bar value={d.rev} max={maxR} color="#FF6B35"/></div>)}</Card>
      <Card><CT>💸 Expense Breakdown</CT>{Object.keys(bc).length===0?<Empty msg="No data"/>:Object.entries(bc).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{const ci=EXP_CATS[cat]||EXP_CATS.misc;return <div key={cat} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700,marginBottom:4}}><span>{ci.icon} {ci.label}</span><span style={{color:"#EF476F"}}>{fmt(amt)}</span></div><Bar value={amt} max={maxE} color={ci.color}/></div>})}</Card>
    </div>
    <Card><CT>📊 Profitability Table</CT><div className="ovx"><table>
      <thead><TH cols={["Product","Sold","Revenue","Profit","Margin"]}/></thead>
      <tbody>{top.length===0&&<tr><td colSpan={5}><Empty msg="No data"/></td></tr>}{top.map(([n,d])=>{const m=pct(d.profit,d.rev);return <tr key={n} style={{borderBottom:"1px solid #F9F0E8"}}><td style={{padding:"9px 10px",fontWeight:700}}>{d.emoji} {n}</td><td style={{padding:"9px 10px"}}>{d.qty}</td><td style={{padding:"9px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(d.rev)}</td><td style={{padding:"9px 10px",fontWeight:800,color:"#06D6A0"}}>{fmt(d.profit)}</td><td style={{padding:"9px 10px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><Bar value={m} max={100} color={m>30?"#06D6A0":m>15?"#FF6B35":"#EF476F"}/><span style={{fontWeight:800,color:m>30?"#06D6A0":m>15?"#FF6B35":"#EF476F",minWidth:34,fontSize:12}}>{m}%</span></div></td></tr>})}</tbody>
    </table></div></Card>
  </div>;
}

// ── CATEGORIES ───────────────────────────────────────────────────────────────
function Categories({cats,reload,products,toast}){
  const [nn,setNN]=useState("");const [ne,setNE]=useState("");const [eIdx,setEIdx]=useState(null);const [ev,setEV]=useState("");const [ee,setEE]=useState("");
  const add=async()=>{const n=nn.trim();if(!n){toast("❌ Enter name!");return;}try{await API.addCategory({name:n,emoji:ne||"🏷️"});setNN("");setNE("");reload();toast("✅ Added!")}catch{toast("❌ Already exists!")}};
  const del=async id=>{const cat=cats.find(c=>c.id===id);const used=products.filter(p=>p.cat===cat.name).length;if(used){toast(`❌ ${used} product(s) use this`);return;}await API.deleteCategory(id);reload();toast("🗑️ Deleted")};
  const save=async id=>{const n=ev.trim();if(!n){toast("❌ Empty!");return;}await API.updateCategory(id,{name:n,emoji:ee||"🏷️"});setEIdx(null);reload();toast("✅ Updated!")};
  const EMOJIS=["🏎️","🚗","🧱","🎲","🧩","👗","🤖","✈️","🚀","⚽","🏆","🎨","📦","🎯","👾","🧸","🦖","🎸","🗿","🏔️","🖼️","👕","🔩","💎"];
  const colors=["#FF6B35","#06D6A0","#3B82F6","#8B5CF6","#F59E0B","#EF476F","#10B981","#6366F1","#EC4899","#14B8A6"];
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid3"><SC icon="🏷️" label="Total" value={cats.length} accent="#FF6B35"/><SC icon="📦" label="In Use" value={[...new Set(products.map(p=>p.cat))].length} accent="#06D6A0"/><SC icon="🕳️" label="Empty" value={cats.filter(c=>!products.find(p=>p.cat===c.name)).length} accent="#9CA3AF"/></div>
    <div className="split">
      <Card>
        <CT>➕ Create Category</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <FI label="Name *" value={nn} onChange={e=>setNN(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="e.g. Gundam..."/>
          <FI label="Emoji" value={ne} onChange={e=>setNE(e.target.value)} placeholder="🏷️" maxLength={4}/>
          <div><div style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",marginBottom:7}}>Quick Pick</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{EMOJIS.map(e=><button key={e} onClick={()=>setNE(e)} style={{width:32,height:32,borderRadius:7,border:(ne===e?"1.5px solid #FF6B35":"1.5px solid #F0D9C0"),background:ne===e?"#FFF3ED":"#FFFAF7",fontSize:16,cursor:"pointer"}}>{e}</button>)}</div></div>
        </div>
        <Btn onClick={add} style={{width:"100%",marginTop:12}}>➕ Add</Btn>
      </Card>
      <Card>
        <CT>🗂️ All ({cats.length})</CT>
        <div className="grid2" style={{maxHeight:450,overflowY:"auto",gap:8}}>
          {cats.map((cat,idx)=>{const used=products.filter(p=>p.cat===cat.name).length;const col=colors[idx%colors.length];
            if(eIdx===idx)return <div key={cat.id} style={{border:"2px solid #FF6B35",borderRadius:12,padding:12,background:"#FFF8F0",display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"flex",gap:7}}><input value={ee} onChange={e=>setEE(e.target.value)} maxLength={4} style={{width:40,border:"1.5px solid #F0D9C0",borderRadius:7,padding:5,fontSize:16,textAlign:"center",background:"#fff",outline:"none"}}/><input value={ev} onChange={e=>setEV(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save(cat.id)} autoFocus style={{flex:1,border:"1.5px solid #FF6B35",borderRadius:7,padding:"6px 9px",fontSize:13,fontWeight:700,outline:"none",background:"#fff",fontFamily:"'Nunito',sans-serif"}}/></div>
              <div style={{display:"flex",gap:5}}><button onClick={()=>save(cat.id)} style={{flex:1,background:"#FF6B35",color:"#fff",border:"none",borderRadius:7,padding:6,fontSize:12,fontWeight:800,cursor:"pointer"}}>💾</button><button onClick={()=>setEIdx(null)} style={{flex:1,background:"#F0E6D3",color:"#4A4E69",border:"none",borderRadius:7,padding:6,fontSize:12,fontWeight:800,cursor:"pointer"}}>✕</button></div>
            </div>;
            return <div key={cat.id} style={{border:"1.5px solid #F0D9C0",borderRadius:12,padding:"12px 14px",background:"#fff",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:36,height:36,borderRadius:9,flexShrink:0,background:col+"18",border:"1.5px solid "+col+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{cat.emoji}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:12}}>{cat.name}</div><div style={{fontSize:10,color:used?"#06D6A0":"#C4B8AC",fontWeight:700}}>{used?(used+" product"+(used>1?"s":"")):"Empty"}</div></div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button onClick={()=>{setEIdx(idx);setEV(cat.name);setEE(cat.emoji)}} style={{width:26,height:26,borderRadius:6,border:"none",background:"#EDE9FE",color:"#5B21B6",fontSize:12,cursor:"pointer"}}>✏️</button>
                <button onClick={()=>del(cat.id)} style={{width:26,height:26,borderRadius:6,border:"none",background:used?"#F3F4F6":"#FEE2E2",color:used?"#9CA3AF":"#991B1B",fontSize:12,cursor:used?"not-allowed":"pointer"}}>🗑️</button>
              </div>
            </div>})}
        </div>
      </Card>
    </div>
  </div>;
}

// ── STAKEHOLDERS ─────────────────────────────────────────────────────────────
function Stakeholders({stakeholders,sales,expenses,reload,toast}){
  const totalGP=sales.reduce((a,s)=>a+s.profit,0);
  const totalExp=expenses.reduce((a,e)=>a+e.amount,0);
  const netProfit=totalGP-totalExp;
  const blank={name:"",emoji:"👤",note:""};
  const [form,setForm]=useState(blank);const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const [showTx,setShowTx]=useState(null);
  const [txForm,setTxForm]=useState({type:"investment",amount:"",date:todayStr(),note:""});
  const add=async()=>{if(!form.name.trim()){toast("❌ Enter name!");return;}await API.addStakeholder({name:form.name.trim(),emoji:form.emoji||"👤",share_pct:0,note:form.note||""});setForm(blank);reload();toast("✅ Added!")};
  const del=async id=>{if(!window.confirm("Delete stakeholder?"))return;await API.deleteStakeholder(id);reload();toast("🗑️ Deleted")};
  const addTx=async(sid)=>{if(!txForm.amount){toast("❌ Enter amount!");return;}await API.addTransaction(sid,{type:txForm.type,amount:+txForm.amount,date:txForm.date,note:txForm.note||""});setTxForm({type:"investment",amount:"",date:todayStr(),note:""});reload();toast("✅ Recorded!")};
  const delTx=async id=>{await API.deleteTransaction(id);reload();toast("🗑️ Deleted")};
  const TX_TYPES={investment:{label:"Investment",color:"#3B82F6",icon:"💰"},withdrawal:{label:"Withdrawal",color:"#EF476F",icon:"💸"},profit_received:{label:"Profit Received",color:"#06D6A0",icon:"💵"},loan:{label:"Loan",color:"#F59E0B",icon:"🏦"}};
  const colors=["#FF6B35","#06D6A0","#8B5CF6","#3B82F6","#F59E0B","#EF476F"];
  const totalInvested=stakeholders.reduce((a,s)=>a+((s.transactions||[]).filter(t=>t.type==="investment").reduce((x,t)=>x+t.amount,0)),0);
  const maxLoan=Math.max(1,...stakeholders.map(s=>(s.transactions||[]).filter(t=>t.type==="loan").reduce((a,t)=>a+t.amount,0)));
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid3">
      <SC icon="👥" label="Stakeholders" value={stakeholders.length} accent="#8B5CF6"/>
      <SC icon="📈" label="Net Profit" value={<span style={{color:netProfit>=0?"#06D6A0":"#EF476F"}}>{fmt(netProfit)}</span>} sub="all time" accent="#06D6A0"/>
      <SC icon="💸" label="Total Invested" value={fmt(totalInvested)} accent="#3B82F6"/>
    </div>
    <Card style={{maxWidth:480}}>
      <CT>➕ Add Stakeholder</CT>
      <div style={{display:"flex",flexDirection:"column",gap:11}}>
        <FI label="Name *" value={form.name} onChange={ff("name")} placeholder="e.g. Razib"/>
        <FI label="Emoji" value={form.emoji} onChange={ff("emoji")} maxLength={4} placeholder="👤"/>
        <FI label="Note" value={form.note} onChange={ff("note")} placeholder="e.g. Founder"/>
      </div>
      <Btn onClick={add} style={{width:"100%",marginTop:12}}>➕ Add</Btn>
    </Card>
    {stakeholders.map((s,i)=>{
      const col=colors[i%colors.length];
      const invested=(s.transactions||[]).filter(t=>t.type==="investment").reduce((a,t)=>a+t.amount,0);
      const withdrawn=(s.transactions||[]).filter(t=>t.type==="withdrawal").reduce((a,t)=>a+t.amount,0);
      const profitReceived=(s.transactions||[]).filter(t=>t.type==="profit_received").reduce((a,t)=>a+t.amount,0);
      const loan=(s.transactions||[]).filter(t=>t.type==="loan").reduce((a,t)=>a+t.amount,0);
      const monthlyProfit={};
      (s.transactions||[]).filter(t=>t.type==="profit_received").forEach(t=>{
        const m=t.date?.slice(0,7);
        if(m)monthlyProfit[m]=(monthlyProfit[m]||0)+t.amount;
      });
      const monthlyRows=Object.entries(monthlyProfit).sort((a,b)=>b[0].localeCompare(a[0]));
      return <Card key={s.id}>
        <CT>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:38,height:38,borderRadius:10,background:col+"18",border:"2px solid "+col+"44",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{s.emoji}</div>
            <div><div style={{fontWeight:800,fontSize:14}}>{s.name}</div><div style={{fontSize:10,color:"#9CA3AF",fontWeight:600}}>{s.note||"Stakeholder"}</div></div>
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setShowTx(showTx===s.id?null:s.id)} style={{background:col+"18",color:col,border:"1.5px solid "+col+"44",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:800,cursor:"pointer"}}>💳 Ledger</button>
            <button onClick={()=>del(s.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:8,padding:"6px 10px",fontSize:12,cursor:"pointer"}}>🗑️</button>
          </div>
        </CT>
        <div className="grid4" style={{marginBottom:12}}>
          {[["💰 Invested",fmt(invested),"#3B82F6"],["💸 Withdrawn",fmt(withdrawn),"#EF476F"],["💵 Profit Received",fmt(profitReceived),"#06D6A0"],["🏦 Loan",fmt(loan),"#F59E0B"]].map(([l,v,c])=>
            <div key={l} style={{background:"#FFF8F0",borderRadius:9,padding:"10px 12px",border:"1px solid #F0E6D3",textAlign:"center"}}><div style={{fontSize:9,color:"#9CA3AF",fontWeight:700,marginBottom:2}}>{l}</div><div style={{fontFamily:"'Baloo 2',cursive",fontSize:15,fontWeight:800,color:c}}>{v}</div>{l==="🏦 Loan"&&<div style={{marginTop:6}}><Bar value={loan} max={maxLoan} color="#F59E0B"/></div>}</div>)}
        </div>
        {monthlyRows.length>0&&<div style={{marginBottom:14,background:"#F0FDF4",borderRadius:10,padding:"10px 14px",border:"1px solid #BBF7D0"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#065F46",textTransform:"uppercase",marginBottom:8}}>💵 Monthly Profit Received</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {monthlyRows.map(([month,amt])=><div key={month} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}>
              <span style={{color:"#374151",fontWeight:600}}>{new Date(month+"-01").toLocaleDateString("en-BD",{year:"numeric",month:"long"})}</span>
              <span style={{fontFamily:"'Baloo 2',cursive",fontWeight:800,color:"#06D6A0"}}>{fmt(amt)}</span>
            </div>)}
          </div>
          <div style={{borderTop:"1px solid #BBF7D0",marginTop:8,paddingTop:8,display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:800}}>
            <span style={{color:"#065F46"}}>Total</span>
            <span style={{fontFamily:"'Baloo 2',cursive",color:"#059669"}}>{fmt(profitReceived)}</span>
          </div>
        </div>}
        {showTx===s.id&&<div style={{borderTop:"1.5px dashed #F0D9C0",paddingTop:14}}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"flex-end"}}>
            <div style={{flex:"1 1 110px"}}><FS value={txForm.type} onChange={e=>setTxForm(p=>({...p,type:e.target.value}))}>{Object.entries(TX_TYPES).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}</FS></div>
            <div style={{flex:"1 1 100px"}}><FI type="number" placeholder="Amount (৳)" value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}/></div>
            <div style={{flex:"1 1 120px"}}><FI type="date" value={txForm.date} onChange={e=>setTxForm(p=>({...p,date:e.target.value}))}/></div>
            <div style={{flex:"1 1 100px"}}><FI placeholder="Note" value={txForm.note} onChange={e=>setTxForm(p=>({...p,note:e.target.value}))}/></div>
            <Btn onClick={()=>addTx(s.id)} style={{padding:"9px 16px"}}>➕ Add</Btn>
          </div>
          {(s.transactions||[]).length===0?<Empty msg="No transactions yet"/>:
          <div className="ovx"><table>
            <thead><TH cols={["Date","Type","Amount","Note",""]}/></thead>
            <tbody>{[...(s.transactions||[])].sort((a,b)=>b.date?.localeCompare(a.date)).map(tx=>{const ti=TX_TYPES[tx.type]||{icon:"💳",color:"#6B7280"};const isOut=tx.type==="withdrawal";return <tr key={tx.id} style={{borderBottom:"1px solid #F9F0E8"}}><td style={{padding:"7px 10px",color:"#9CA3AF",fontSize:11}}>{tx.date}</td><td style={{padding:"7px 10px"}}><Pill bg={ti.color+"18"} color={ti.color}>{ti.icon} {ti.label||tx.type}</Pill></td><td style={{padding:"7px 10px",fontWeight:800,color:isOut?"#EF476F":"#06D6A0"}}>{isOut?"-":"+"} {fmt(tx.amount)}</td><td style={{padding:"7px 10px",color:"#9CA3AF",fontSize:11}}>{tx.note||"—"}</td><td style={{padding:"7px 10px"}}><button onClick={()=>delTx(tx.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"3px 8px",fontSize:11,cursor:"pointer"}}>🗑️</button></td></tr>})}</tbody>
          </table></div>}
        </div>}
      </Card>})}
  </div>;
}

// ── USERS (Owner only) ───────────────────────────────────────────────────────
function Users({users,reload,currentUser,toast}){
  const blank={username:"",name:"",password:"",role:"Staff",emoji:"🧑‍🔧"};
  const [form,setForm]=useState(blank);const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));
  const [editId,setEditId]=useState(null);const [editForm,setEditForm]=useState({});const [showPw,setShowPw]=useState(false);
  const ROLES=["Owner","Manager","Staff"];
  const EMOJIS=["👑","🧑‍💼","🧑‍🔧","👨‍💻","👩‍💼","🧑‍🎨","🧑‍🏫","🤝","👤"];
  const add=async()=>{
    if(!form.username.trim()||!form.name.trim()||!form.password.trim()){toast("❌ Fill all fields!");return;}
    try{await API.addUser({username:form.username.trim().toLowerCase(),name:form.name.trim(),password:form.password,role:form.role,emoji:form.emoji||"🧑‍🔧"});setForm(blank);reload();toast("✅ User added!");}
    catch(e){toast("❌ "+e.message);}
  };
  const del=async(id)=>{if(id===currentUser.id){toast("❌ Can't delete yourself!");return;}if(!window.confirm("Delete user?"))return;await API.deleteUser(id);reload();toast("🗑️ Deleted")};
  const saveEdit=async()=>{
    const d={name:editForm.name,role:editForm.role,emoji:editForm.emoji};
    if(editForm.newPw)d.password=editForm.newPw;
    await API.updateUser(editId,d);setEditId(null);reload();toast("✅ Updated!");
  };
  const ROLE_COLORS={Owner:{bg:"#FEF3C7",c:"#92400E"},Manager:{bg:"#DBEAFE",c:"#1E40AF"},Staff:{bg:"#F3F4F6",c:"#374151"}};
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid3">
      <SC icon="👥" label="Total Users" value={users.length} accent="#8B5CF6"/>
      <SC icon="👑" label="Owners" value={users.filter(u=>u.role==="Owner").length} accent="#F59E0B"/>
      <SC icon="🧑‍🔧" label="Staff" value={users.filter(u=>u.role==="Staff").length} accent="#06D6A0"/>
    </div>
    <div className="split">
      <Card>
        <CT>➕ Add New User</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          <div className="grid2" style={{gap:10}}>
            <FI label="Username *" value={form.username} onChange={ff("username")} placeholder="e.g. rahim" autoCapitalize="none"/>
            <FI label="Full Name *" value={form.name} onChange={ff("name")} placeholder="e.g. Rahim"/>
            <FI label="Password *" type="password" value={form.password} onChange={ff("password")} placeholder="Min 4 chars"/>
            <FS label="Role" value={form.role} onChange={ff("role")}>{ROLES.map(r=><option key={r}>{r}</option>)}</FS>
          </div>
          <div><label style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.06em",display:"block",marginBottom:7}}>Emoji</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
              {EMOJIS.map(e=><button key={e} onClick={()=>setForm(p=>({...p,emoji:e}))} style={{width:34,height:34,borderRadius:8,border:(form.emoji===e?"1.5px solid #FF6B35":"1.5px solid #F0D9C0"),background:form.emoji===e?"#FFF3ED":"#FFFAF7",fontSize:18,cursor:"pointer"}}>{e}</button>)}
            </div>
          </div>
        </div>
        <Btn onClick={add} style={{width:"100%",marginTop:12}}>➕ Add User</Btn>
      </Card>
      <Card>
        <CT>👥 Team ({users.length})</CT>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {users.map(u=>{
            const rc=ROLE_COLORS[u.role]||ROLE_COLORS.Staff;
            if(editId===u.id)return <div key={u.id} style={{border:"2px solid #FF6B35",borderRadius:12,padding:14,background:"#FFF8F0"}}>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                {EMOJIS.map(e=><button key={e} onClick={()=>setEditForm(f=>({...f,emoji:e}))} style={{width:30,height:30,borderRadius:7,border:(editForm.emoji===e?"1.5px solid #FF6B35":"1.5px solid #F0D9C0"),background:editForm.emoji===e?"#FFF3ED":"#FFFAF7",fontSize:16,cursor:"pointer"}}>{e}</button>)}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:9}}>
                <FI label="Full Name" value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/>
                <FS label="Role" value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}>{ROLES.map(r=><option key={r}>{r}</option>)}</FS>
                <div style={{position:"relative"}}><FI label="New Password (leave blank to keep)" type={showPw?"text":"password"} value={editForm.newPw||""} onChange={e=>setEditForm(f=>({...f,newPw:e.target.value}))} placeholder="Leave blank to keep"/><button onClick={()=>setShowPw(p=>!p)} style={{position:"absolute",right:10,top:26,background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#9CA3AF"}}>{showPw?"🙈":"👁️"}</button></div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}><Btn onClick={saveEdit} style={{flex:1}}>💾 Save</Btn><Btn variant="secondary" onClick={()=>setEditId(null)} style={{flex:1}}>Cancel</Btn></div>
            </div>;
            return <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1.5px solid #F0D9C0",borderRadius:12,background:"#fff"}}>
              <div style={{width:38,height:38,borderRadius:10,background:"#FFF8F0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,border:"1.5px solid #F0E6D3"}}>{u.emoji}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontWeight:800,fontSize:13}}>{u.name} {u.id===currentUser.id&&<span style={{fontSize:10,color:"#9CA3AF"}}>(you)</span>}</div><div style={{fontSize:11,color:"#9CA3AF"}}>@{u.username}</div></div>
              <Pill bg={rc.bg} color={rc.c}>{u.role}</Pill>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>{setEditId(u.id);setEditForm({...u,newPw:""})}} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:7,padding:"6px 9px",fontSize:12,cursor:"pointer"}}>✏️</button>
                <button onClick={()=>del(u.id)} style={{background:u.id===currentUser.id?"#F3F4F6":"#FEE2E2",color:u.id===currentUser.id?"#9CA3AF":"#991B1B",border:"none",borderRadius:7,padding:"6px 9px",fontSize:12,cursor:u.id===currentUser.id?"not-allowed":"pointer"}}>🗑️</button>
              </div>
            </div>})}
        </div>
      </Card>
    </div>
  </div>;
}


// ── DELIVERIES ────────────────────────────────────────────────────────────────
function Deliveries({deliveries,products,sales,reload,toast}){
  const blank={
    sale_id:"",recipient_name:"",recipient_phone:"",recipient_address:"",
    amount_to_collect:"",item_description:"",item_quantity:"1",item_weight:"0.5",note:"",delivery_type:"inside"
  };
  const [form,setForm]=useState(blank);
  const [loading,setLoading]=useState(false);
  const [syncing,setSyncing]=useState(null);
  const ff=k=>e=>setForm(p=>({...p,[k]:e.target.value}));

  const handleSaleSelect=e=>{
    const sid=e.target.value;
    const sale=sales.find(s=>String(s.id)===sid);
    if(sale){
      setForm(p=>({...p,
        sale_id:sid,
        recipient_name:sale.customer||"",
        amount_to_collect:String(sale.total),
        item_description:sale.product_name||"",
        merchant_order_id:sale.inv,
      }));
    } else {
      setForm(p=>({...p,sale_id:"",merchant_order_id:""}));
    }
  };

  const submit=async()=>{
    if(!form.recipient_name.trim()||!form.recipient_phone.trim()||!form.recipient_address.trim()||!form.amount_to_collect){
      toast("❌ Fill required fields!");return;
    }
    setLoading(true);
    try{
      const merchant_order_id=form.merchant_order_id||("THC-"+Date.now().toString().slice(-6));
      await API.createDelivery({...form,merchant_order_id,item_quantity:+form.item_quantity||1,item_weight:+form.item_weight||0.5,amount_to_collect:+form.amount_to_collect});
      setForm(blank);reload();toast("✅ Pathao order created!");
    }catch(e){toast("❌ "+e.message);}
    finally{setLoading(false);}
  };

  const sync=async(id)=>{
    setSyncing(id);
    try{await API.syncDelivery(id);reload();toast("🔄 Status synced!");}
    catch(e){toast("❌ "+e.message);}
    finally{setSyncing(null);}
  };

  const del=async id=>{await API.deleteDelivery(id);reload();toast("🗑️ Deleted")};
  const cancel=async id=>{await API.cancelDelivery(id);reload();toast("❌ Delivery cancelled — amounts deducted")};

  const STATUS_COLORS={
    pending:{bg:"#FEF3C7",c:"#92400E"},
    delivered:{bg:"#D1FAE5",c:"#065F46"},
    cancelled:{bg:"#FEE2E2",c:"#991B1B"},
  };

  const totalCOD=deliveries.reduce((a,d)=>a+(+d.amount_to_collect||0),0);
  const delivered=deliveries.filter(d=>d.status==="delivered");
  const pending=deliveries.filter(d=>d.status==="pending");

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid4">
      <SC icon="🛵" label="Total Orders" value={deliveries.length} accent="#FF6B35"/>
      <SC icon="⏳" label="Pending" value={pending.length} accent="#F59E0B"/>
      <SC icon="✅" label="Delivered" value={delivered.length} accent="#06D6A0"/>
      <SC icon="💰" label="Total COD" value={fmt(totalCOD)} accent="#3B82F6"/>
    </div>
    <div className="split">
      <Card>
        <CT>🛵 New Pathao Delivery</CT>
        <div style={{display:"flex",flexDirection:"column",gap:11}}>
          {/* Product selector — auto fills price, cost, description */}
          <FS label="Select Product (auto-fills price & deducts stock)" value={form.product_id||""} onChange={e=>{
            const pid=e.target.value;
            const p=products.find(x=>String(x.id)===pid);
            if(p) setForm(prev=>({...prev,product_id:pid,amount_to_collect:String(p.sell),buy_price:String(p.buy),item_description:p.name}));
            else setForm(prev=>({...prev,product_id:""}));
          }}>
            <option value="">— Select product (optional) —</option>
            {products.map(p=><option key={p.id} value={p.id}>{p.emoji} {p.name} — {fmt(p.sell)} (stock: {p.stock})</option>)}
          </FS>
          <div className="grid2" style={{gap:10}}>
            <FI label="Recipient Name *" value={form.recipient_name} onChange={ff("recipient_name")} placeholder="Customer name"/>
            <FI label="Phone * (01XXXXXXXXX)" value={form.recipient_phone} onChange={ff("recipient_phone")} placeholder="01XXXXXXXXX"/>
          </div>
          <FI label="Delivery Address *" value={form.recipient_address} onChange={ff("recipient_address")} placeholder="House, Road, Area, Dhaka"/>
          <div className="grid2" style={{gap:10}}>
            <FI label="Selling Price (৳) *" type="number" value={form.amount_to_collect} onChange={ff("amount_to_collect")} placeholder="0"/>
            <FI label="Buy/Cost Price (৳)" type="number" value={form.buy_price||""} onChange={ff("buy_price")} placeholder="0 (for profit calc)"/>
            <FI label="Item Description" value={form.item_description} onChange={ff("item_description")} placeholder="e.g. LEGO Set"/>
            <FI label="Qty" type="number" value={form.item_quantity} onChange={ff("item_quantity")} placeholder="1"/>
            <FI label="Weight (kg)" type="number" value={form.item_weight} onChange={ff("item_weight")} placeholder="0.5"/>
          </div>
          <div style={{display:"flex",gap:0,marginTop:4,borderRadius:9,overflow:"hidden",border:"1.5px solid #F0D9C0"}}>
            {[["inside","🏙️ Inside Dhaka ৳80"],["outside","🗺️ Outside Dhaka ৳150"]].map(([val,lbl])=>
              <button key={val} onClick={()=>setForm(p=>({...p,delivery_type:val}))} style={{flex:1,padding:"9px 8px",border:"none",background:form.delivery_type===val?"#FF6B35":"#FFFAF7",color:form.delivery_type===val?"#fff":"#6B7280",fontFamily:"'Nunito',sans-serif",fontSize:12,fontWeight:800,cursor:"pointer"}}>{lbl}</button>)}
          </div>
          <FI label="Special Instruction" value={form.note||""} onChange={ff("note")} placeholder="Optional..."/>
        </div>
        {form.amount_to_collect&&<div style={{background:"linear-gradient(135deg,#1A1A2E,#2D2D5E)",borderRadius:11,padding:"14px 16px",marginTop:4}}>
          <div style={{fontSize:9,color:"rgba(255,255,255,.5)",fontWeight:700,textTransform:"uppercase",marginBottom:8}}>💰 Amount Breakdown</div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:4}}><span>Product Price (your revenue)</span><span style={{color:"#FFD166"}}>{fmt(+form.amount_to_collect||0)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"rgba(255,255,255,.7)",marginBottom:4}}><span>Delivery Charge (extra income)</span><span style={{color:"#06D6A0"}}>+{fmt(form.delivery_type==="outside"?150:80)}</span></div>
          <div style={{height:1,background:"rgba(255,255,255,.1)",margin:"8px 0"}}/>
          <div style={{display:"flex",justifyContent:"space-between",fontFamily:"'Baloo 2',cursive",fontSize:18,fontWeight:800,color:"#fff"}}><span>Total COD Customer Pays</span><span>{fmt((+form.amount_to_collect||0)+(form.delivery_type==="outside"?150:80))}</span></div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.4)",marginTop:6}}>⚠️ Delivery charge is NOT counted in product profit</div>
        </div>}
        <div style={{marginTop:10,background:"#FFF8F0",borderRadius:11,padding:12,border:"1.5px solid #F0D9C0"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",marginBottom:6}}>Sender Info (Auto)</div>
          <div style={{fontSize:12,color:"#6B7280"}}><b>The Hobby Center</b> · 01839000021</div>
          <div style={{fontSize:11,color:"#9CA3AF"}}>Section 12 Block D Road 16 House 52 Pallabi Mirpur Dhaka</div>
          <div style={{fontSize:11,color:"#9CA3AF",marginTop:2}}>Zone: Mirpur 12 · City: Dhaka</div>
        </div>
        <Btn onClick={submit} style={{width:"100%",marginTop:12,opacity:loading?.6:1}}>
          {loading?"⏳ Creating on Pathao...":"🛵 Create Pathao Order"}
        </Btn>
      </Card>
      <Card>
        <CT>📋 Recent Deliveries</CT>
        {deliveries.length===0?<Empty msg="No deliveries yet"/>:
        [...deliveries].slice(0,8).map(d=>{
          const sc=STATUS_COLORS[d.status]||STATUS_COLORS.pending;
          return <div key={d.id} style={{padding:"10px 0",borderBottom:"1px solid #F9F0E8"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
              <div style={{fontWeight:700,fontSize:13}}>{d.recipient_name}</div>
              <Pill bg={sc.bg} color={sc.c}>{d.pathao_status||d.status}</Pill>
            </div>
            <div style={{fontSize:11,color:"#9CA3AF",marginBottom:4}}>{d.recipient_phone} · {fmt(d.amount_to_collect)} COD</div>
            {d.consignment_id&&<div style={{fontSize:11,fontWeight:700,color:"#3B82F6"}}>📦 {d.consignment_id}</div>}
            <div style={{display:"flex",gap:6,marginTop:6}}>
              <button onClick={()=>sync(d.id)} disabled={syncing===d.id} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",opacity:syncing===d.id?.6:1}}>
                {syncing===d.id?"⏳":"🔄"} Sync
              </button>
              {d.status!=="cancelled"&&<button onClick={()=>cancel(d.id)} style={{background:"#FEF3C7",color:"#92400E",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>❌ Cancel</button>}
              <button onClick={()=>del(d.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:7,padding:"5px 10px",fontSize:11,cursor:"pointer"}}>🗑️</button>
            </div>
          </div>})}
      </Card>
    </div>
    <Card>
      <CT>🛵 All Deliveries ({deliveries.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={["Date","Recipient","Phone","Delivery","COD","Charge","Consignment ID","Status","Actions"]}/></thead>
        <tbody>
          {deliveries.length===0&&<tr><td colSpan={8}><Empty msg="No deliveries yet"/></td></tr>}
          {deliveries.map(d=>{
            const sc=STATUS_COLORS[d.status]||STATUS_COLORS.pending;
            return <tr key={d.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
              <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11}}>{d.created_at}</td>
              <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{d.recipient_name}</td>
              <td style={{padding:"8px 10px",fontSize:12}}>{d.recipient_phone}</td>
              <td style={{padding:"8px 10px",fontSize:11,color:"#6B7280",maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.recipient_address}</td>
              <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(d.amount_to_collect)}</td>
              <td style={{padding:"8px 10px",fontWeight:800,color:d.status==="cancelled"?"#9CA3AF":"#3B82F6"}}>{d.status==="cancelled"?<s>{fmt(d.delivery_charge)}</s>:fmt(d.delivery_charge)}</td>
              <td style={{padding:"8px 10px"}}>{d.consignment_id?<span style={{fontSize:11,fontWeight:700,color:"#3B82F6",background:"#EFF6FF",padding:"2px 8px",borderRadius:6}}>{d.consignment_id}</span>:<span style={{color:"#9CA3AF",fontSize:11}}>—</span>}</td>
              <td style={{padding:"8px 10px"}}><Pill bg={sc.bg} color={sc.c}>{d.pathao_status||d.status}</Pill></td>
              <td style={{padding:"8px 10px"}}><div style={{display:"flex",gap:5}}>
                <button onClick={()=>sync(d.id)} disabled={syncing===d.id} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer"}}>🔄</button>
                {d.status!=="cancelled"&&<button onClick={()=>cancel(d.id)} style={{background:"#FEF3C7",color:"#92400E",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer"}}>❌</button>}
                <button onClick={()=>del(d.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer"}}>🗑️</button>
              </div></td>
            </tr>})}
        </tbody>
      </table></div>
    </Card>
  </div>;
}



// ── STOCK HISTORY ─────────────────────────────────────────────────────────────
function StockHistory({stockHistory,products,reload}){
  const [filter,setFilter]=useState("");
  const [reasonF,setReasonF]=useState("");
  const REASONS={
    sale:{label:"Sale",bg:"#FEE2E2",c:"#991B1B",icon:"💰"},
    purchase_received:{label:"Purchase In",bg:"#D1FAE5",c:"#065F46",icon:"📦"},
    pathao_delivery:{label:"Pathao Out",bg:"#DBEAFE",c:"#1E40AF",icon:"🛵"},
    delivery_cancelled:{label:"Delivery Cancelled",bg:"#FEF3C7",c:"#92400E",icon:"↩️"},
    manual_adjustment:{label:"Manual Edit",bg:"#EDE9FE",c:"#5B21B6",icon:"✏️"},
  };
  const filtered=stockHistory.filter(h=>
    (!filter||h.product_name?.toLowerCase().includes(filter.toLowerCase()))&&
    (!reasonF||h.reason===reasonF)
  );
  const totalIn=stockHistory.filter(h=>h.change_qty>0).reduce((a,h)=>a+h.change_qty,0);
  const totalOut=stockHistory.filter(h=>h.change_qty<0).reduce((a,h)=>a+Math.abs(h.change_qty),0);
  const printStock=()=>{
    const w=window.open("","_blank","width=800,height=600");
    if(!w)return;
    const rows=stockHistory.slice(0,200);
    const rowsHtml=rows.map(h=>"<tr><td>"+h.created_at+"</td><td>"+h.product_name+"</td><td>"+h.reason+"</td><td class='"+(h.change_qty>0?"green":"red")+"'>"+(h.change_qty>0?"+":"")+h.change_qty+"</td><td>"+h.old_stock+"</td><td>"+h.new_stock+"</td><td>"+(h.ref||"—")+"</td><td>"+(h.changed_by||"—")+"</td></tr>").join("");
    const html="<!DOCTYPE html><html><head><title>Stock Log</title><style>body{font-family:Arial,sans-serif;padding:20px}h1{color:#FF6B35}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#FFF8F0;padding:6px 10px;text-align:left;font-size:10px;color:#9CA3AF;text-transform:uppercase}td{padding:6px 10px;border-bottom:1px solid #F9F0E8}.green{color:#06D6A0;font-weight:800}.red{color:#EF476F;font-weight:800}</style></head><body><h1>🎮 Stock Movement Log</h1><p style='color:#9CA3AF;font-size:12px'>Generated: "+new Date().toLocaleString("en-BD")+"</p><table><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Before</th><th>After</th><th>Ref</th><th>By</th></tr>"+rowsHtml+"</table></body></html>";
    w.document.write(html);w.document.close();w.focus();setTimeout(()=>w.print(),400);
  };
  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="no-print" style={{display:"flex",justifyContent:"flex-end",marginBottom:-8}}><Btn onClick={printStock} variant="secondary">🖨️ Print Stock Log</Btn></div>
    <div className="grid3">
      <SC icon="📋" label="Total Logs" value={stockHistory.length} accent="#6B7280"/>
      <SC icon="📈" label="Total In" value={"+"+totalIn+" units"} accent="#06D6A0"/>
      <SC icon="📉" label="Total Out" value={"-"+totalOut+" units"} accent="#EF476F"/>
    </div>
    <Card>
      <CT>📋 Stock Movement Log ({filtered.length})
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="🔍 Product..." style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"6px 10px",fontFamily:"'Nunito',sans-serif",fontSize:12,background:"#FFFAF7",outline:"none",width:120}}/>
          <select value={reasonF} onChange={e=>setReasonF(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"6px 10px",fontFamily:"'Nunito',sans-serif",fontSize:12,background:"#FFFAF7",outline:"none"}}>
            <option value="">All Types</option>
            {Object.entries(REASONS).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
        </div>
      </CT>
      <div className="ovx"><table>
        <thead><TH cols={["Date/Time","Product","Type","Change","Before","After","Ref","By"]}/></thead>
        <tbody>
          {filtered.length===0&&<tr><td colSpan={8}><Empty msg="No stock movements yet"/></td></tr>}
          {filtered.map(h=>{
            const r=REASONS[h.reason]||{label:h.reason,bg:"#F3F4F6",c:"#6B7280",icon:"📋"};
            return <tr key={h.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
              <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11,whiteSpace:"nowrap"}}>{h.created_at}</td>
              <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{h.product_name}</td>
              <td style={{padding:"8px 10px"}}><Pill bg={r.bg} color={r.c}>{r.icon} {r.label}</Pill></td>
              <td style={{padding:"8px 10px",fontWeight:800,fontSize:13,color:h.change_qty>0?"#06D6A0":"#EF476F"}}>{h.change_qty>0?"+":""}{h.change_qty}</td>
              <td style={{padding:"8px 10px",color:"#9CA3AF"}}>{h.old_stock}</td>
              <td style={{padding:"8px 10px",fontWeight:700}}>{h.new_stock}</td>
              <td style={{padding:"8px 10px",fontSize:11,color:"#6B7280"}}>{h.ref||"—"}</td>
              <td style={{padding:"8px 10px",fontSize:11,color:"#9CA3AF"}}>{h.changed_by||"—"}</td>
            </tr>;
          })}
        </tbody>
      </table></div>
    </Card>
  </div>;
}


// ── WOOCOMMERCE ───────────────────────────────────────────────────────────────
function WooCommerce({toast}){
  const [status,setStatus]=useState(null);
  const [orders,setOrders]=useState([]);
  const [loading,setLoading]=useState({});
  const [pages,setPages]=useState(1);

  const load=async()=>{
    try{
      const [s,o]=await Promise.all([API.getWCStatus(),API.getWCOrders()]);
      setStatus(s);setOrders(o);
    }catch(e){toast("❌ "+e.message);}
  };

  useState(()=>{load();},[]);

  const run=async(key,fn,msg)=>{
    setLoading(p=>({...p,[key]:true}));
    try{const r=await fn();toast("✅ "+msg+(r.mapped!==undefined?" — "+r.mapped+" mapped, "+r.created+" created":""));load();}
    catch(e){toast("❌ "+e.message);}
    finally{setLoading(p=>({...p,[key]:false}));}
  };

  const STATUS_COLORS={success:{bg:"#D1FAE5",c:"#065F46"},error:{bg:"#FEE2E2",c:"#991B1B"},warn:{bg:"#FEF3C7",c:"#92400E"}};

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid4">
      <SC icon="🔗" label="Mapped Products" value={status?.mapped||0} accent="#3B82F6"/>
      <SC icon="🛒" label="Orders Synced" value={status?.orders||0} accent="#06D6A0"/>
      <SC icon="⚠️" label="Errors (24h)" value={status?.errors||0} accent={status?.errors>0?"#EF476F":"#06D6A0"}/>
      <SC icon="🔄" label="Stock Sync" value="Every 30min" accent="#8B5CF6"/>
    </div>

    <div className="split">
      <Card>
        <CT>⚙️ Setup & Sync</CT>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>

          <div style={{background:"#FFF8F0",borderRadius:11,padding:14,border:"1.5px solid #F0D9C0"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>Step 1 — Register Webhook</div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:10}}>Auto-registers the WooCommerce webhook so new orders flow into MGT instantly.</div>
            <Btn onClick={()=>run("webhook",API.registerWCWebhook,"Webhook registered!")} style={{opacity:loading.webhook?.6:1}}>
              {loading.webhook?"⏳ Registering...":"🔗 Register Webhook"}
            </Btn>
          </div>

          <div style={{background:"#FFF8F0",borderRadius:11,padding:14,border:"1.5px solid #F0D9C0"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>Step 2 — Sync Products</div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:10}}>Pulls all WooCommerce products into MGT. Matches by SKU. Updates stock + price from website. Creates new products if not found.</div>
            <Btn onClick={()=>run("products",API.syncWCProducts,"Products synced!")} style={{opacity:loading.products?.6:1}}>
              {loading.products?"⏳ Syncing...":"📦 Sync Products from WooCommerce"}
            </Btn>
          </div>

          <div style={{background:"#FFF8F0",borderRadius:11,padding:14,border:"1.5px solid #F0D9C0"}}>
            <div style={{fontWeight:800,fontSize:13,marginBottom:4}}>Step 3 — Backfill Past Orders</div>
            <div style={{fontSize:12,color:"#6B7280",marginBottom:10}}>Only imports <b>Processing</b> orders — creates sale + Pathao delivery for each. Skips Completed and Cancelled orders.</div>
            <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
              <div style={{width:80}}><FI label="Pages" type="number" value={pages} onChange={e=>setPages(+e.target.value||1)} style={{width:"100%"}}/></div>
              <Btn onClick={()=>run("orders",()=>API.syncWCOrders(pages),"Orders imported!")} style={{opacity:loading.orders?.6:1}}>
                {loading.orders?"⏳ Importing...":"📥 Import Past Orders"}
              </Btn>
            </div>
          </div>

          <div style={{background:"#D1FAE5",borderRadius:11,padding:12,border:"1.5px solid #BBF7D0"}}>
            <div style={{fontSize:12,fontWeight:700,color:"#065F46"}}>✅ After setup — automatic:</div>
            <div style={{fontSize:12,color:"#065F46",marginTop:4,lineHeight:1.6}}>
              • New WooCommerce order → sale auto-created in MGT<br/>
              • Stock auto-deducted from inventory<br/>
              • Pathao delivery auto-created with customer address<br/>
              • MGT stock syncs back to WooCommerce every 30 minutes
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CT>📋 Sync Log</CT>
        {!status?.logs?.length?<Empty msg="No sync activity yet"/>:
        status.logs.map(l=>{
          const sc=STATUS_COLORS[l.status]||STATUS_COLORS.warn;
          return <div key={l.id} style={{padding:"8px 0",borderBottom:"1px solid #F9F0E8"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
              <Pill bg={sc.bg} color={sc.c}>{l.status}</Pill>
              <span style={{fontSize:10,color:"#9CA3AF"}}>{l.created_at}</span>
              <span style={{fontSize:10,color:"#9CA3AF",marginLeft:"auto"}}>{l.type}</span>
            </div>
            <div style={{fontSize:12,color:"#6B7280"}}>{l.message}</div>
          </div>})}
        <div style={{marginTop:10}}><Btn variant="secondary" onClick={load} style={{width:"100%"}}>🔄 Refresh</Btn></div>
      </Card>
    </div>

    <Card>
      <CT>🛒 WooCommerce Orders Synced ({orders.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={["WC Order","Customer","Phone","Items","Total","Payment","Pathao","Synced"]}/></thead>
        <tbody>
          {orders.length===0&&<tr><td colSpan={8}><Empty msg="No orders synced yet"/></td></tr>}
          {orders.map(o=><tr key={o.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#3B82F6"}}>#{o.wc_order_id}</td>
            <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{o.customer_name}</td>
            <td style={{padding:"8px 10px",fontSize:11,color:"#6B7280"}}>{o.customer_phone||"—"}</td>
            <td style={{padding:"8px 10px",fontSize:11,color:"#6B7280",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {o.items?JSON.parse(o.items).join(", "):"—"}
            </td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(o.total)}</td>
            <td style={{padding:"8px 10px"}}><Pill bg="#DBEAFE" color="#1E40AF">{o.payment_method}</Pill></td>
            <td style={{padding:"8px 10px"}}>{o.delivery_id?<Pill bg="#D1FAE5" color="#065F46">✅ Created</Pill>:<Pill bg="#F3F4F6" color="#6B7280">—</Pill>}</td>
            <td style={{padding:"8px 10px",fontSize:11,color:"#9CA3AF"}}>{o.synced_at}</td>
          </tr>)}
        </tbody>
      </table></div>
    </Card>
  </div>;
}


// ── PRE-ORDERS ────────────────────────────────────────────────────────────────
function PreOrders({toast}){
  const [orders,setOrders]=useState([]);
  const [months,setMonths]=useState([]);
  const [selMonth,setSelMonth]=useState("");
  const [loading,setLoading]=useState(false);
  const [syncing,setSyncing]=useState(false);
  const [creatingPathao,setCreatingPathao]=useState(null);
  const [editingCell,setEditingCell]=useState(null);
  const [cellValue,setCellValue]=useState("");

  const startEdit=(id,field,val)=>{setEditingCell({id,field});setCellValue(String(val||""));};
  const saveCell=async(o)=>{
    const val=+cellValue||0;
    const price  = editingCell.field==="product_price" ? val : +o.product_price||0;
    const paid   = editingCell.field==="paid_amount"   ? val : +o.paid_amount||0;
    const courier= editingCell.field==="courier"       ? val : +o.courier||0;
    // If editing due directly, use that value; otherwise auto-calculate
    const due    = editingCell.field==="due" ? val : price - paid;
    const final_price = due + courier;
    await API.updatePreOrder(o.id,{
      paid_amount:paid, product_price:price, courier,
      due, final_price,
      customer_name:o.customer_name, phone:o.phone, address:o.address
    });
    setEditingCell(null);
    load(selMonth);
  };

  const STATUS_COLORS={
    pending     :{bg:"#FEF3C7",c:"#92400E",label:"Pending"},
    confirmed   :{bg:"#DBEAFE",c:"#1E40AF",label:"Confirmed"},
    pathao_created:{bg:"#D1FAE5",c:"#065F46",label:"Pathao Created"},
    delivered   :{bg:"#EDE9FE",c:"#5B21B6",label:"Delivered"},
    cancelled   :{bg:"#FEE2E2",c:"#991B1B",label:"Cancelled"},
  };

  const load=async(month="")=>{
    setLoading(true);
    try{
      const [o,m]=await Promise.all([API.getPreOrders(month),API.getPreOrderMonths()]);
      setOrders(o);setMonths(m);
    }catch(e){toast("❌ "+e.message);}
    finally{setLoading(false);}
  };

  useEffect(()=>{load();},[]);

  const sync=async()=>{
    setSyncing(true);
    try{
      const r=await API.syncPreOrders();
      toast("✅ Synced! "+r.added+" new orders added");
      load(selMonth);
    }catch(e){toast("❌ "+e.message);}
    finally{setSyncing(false);}
  };

  const changeMonth=m=>{setSelMonth(m);load(m);};

  const updateStatus=async(id,status)=>{
    await API.updatePreOrderStatus(id,{status});
    load(selMonth);toast("✅ Status updated");
  };

  const createPathao=async(id)=>{
    setCreatingPathao(id);
    try{
      const r=await API.createPreOrderPathao(id);
      toast("✅ Pathao created! "+r.consignment_id);
      load(selMonth);
    }catch(e){toast("❌ "+e.message);}
    finally{setCreatingPathao(null);}
  };

  const del=async id=>{
    if(!window.confirm("Delete this pre-order?"))return;
    await API.deletePreOrder(id);load(selMonth);toast("🗑️ Deleted");
  };

  const pending=orders.filter(o=>o.status==="pending").length;
  const confirmed=orders.filter(o=>o.status==="confirmed").length;
  const pathaoCreated=orders.filter(o=>o.status==="pathao_created").length;
  const totalPaid=orders.reduce((a,o)=>a+(+o.paid_amount||0),0);

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <div className="grid4">
      <SC icon="📋" label="Total Orders" value={orders.length} accent="#8B5CF6"/>
      <SC icon="⏳" label="Pending" value={pending} accent="#F59E0B"/>
      <SC icon="💰" label="Total Paid" value={fmt(totalPaid)} accent="#06D6A0"/>
      <SC icon="🎯" label="Total Price" value={fmt(orders.reduce((a,o)=>a+(+o.product_price||0),0))} accent="#FF6B35"/>
    </div>
    <div className="grid4">
      <SC icon="💸" label="Total Due" value={fmt(orders.reduce((a,o)=>a+(+o.due||(+o.product_price-(+o.paid_amount||0))),0))} accent="#EF476F"/>
      <SC icon="🚚" label="Total Courier" value={fmt(orders.reduce((a,o)=>a+(+o.courier||0),0))} accent="#3B82F6"/>
      <SC icon="💵" label="Total Final" value={fmt(orders.reduce((a,o)=>a+(+o.final_price||(+o.product_price-(+o.paid_amount||0)+(+o.courier||0))),0))} accent="#06D6A0"/>
      <SC icon="✅" label="Pathao Created" value={pathaoCreated} accent="#8B5CF6"/>
    </div>

    <Card style={{padding:"12px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <Btn onClick={sync} style={{opacity:syncing?.6:1}}>
          {syncing?"⏳ Syncing...":"🔄 Sync from Google Sheet"}
        </Btn>
        <span style={{fontSize:11,color:"#9CA3AF",fontWeight:700}}>Filter by month:</span>
        <button onClick={()=>changeMonth("")} style={{border:"1.5px solid",borderColor:selMonth===""?"#FF6B35":"#F0D9C0",background:selMonth===""?"#FF6B35":"#FFFAF7",color:selMonth===""?"#fff":"#6B7280",borderRadius:18,padding:"5px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>All</button>
        {months.map(m=><button key={m.month} onClick={()=>changeMonth(m.month)} style={{border:"1.5px solid",borderColor:selMonth===m.month?"#FF6B35":"#F0D9C0",background:selMonth===m.month?"#FF6B35":"#FFFAF7",color:selMonth===m.month?"#fff":"#6B7280",borderRadius:18,padding:"5px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>{m.month} ({m.count})</button>)}
        <span style={{marginLeft:"auto",fontSize:12,color:"#9CA3AF",fontWeight:700}}>{orders.length} order(s)</span>
      </div>
    </Card>

    <Card>
      <CT>📋 Pre-Orders {selMonth&&"— "+selMonth} ({orders.length})</CT>
      {loading?<Empty msg="Loading..."/>:orders.length===0?<Empty msg="No pre-orders yet. Click Sync to fetch from Google Sheet."/>:
      <div className="ovx"><table>
        <thead><TH cols={["Date","Customer","Phone","Address","Paid ✏️","Price","Due ✏️","Courier ✏️","Final","Actions"]}/></thead>
        <tbody>
          {orders.map(o=>{
            const autoDue=(+o.product_price||0)-(+o.paid_amount||0);
            const due=(o.due!==null&&o.due!==undefined&&+o.due!==0)?+o.due:autoDue;
            const courier=+o.courier||0;
            const final_amt=due+courier;
            return <tr key={o.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
              <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11,whiteSpace:"nowrap"}}>{o.timestamp?new Date(o.timestamp).toLocaleDateString("en-BD"):"—"}</td>
              <td style={{padding:"8px 10px",fontWeight:700,fontSize:12,maxWidth:160}}>{o.customer_name}</td>
              <td style={{padding:"8px 10px",fontSize:12,whiteSpace:"nowrap"}}>{o.phone||"—"}</td>
              <td style={{padding:"8px 10px",fontSize:11,color:"#6B7280",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.address||"—"}</td>
              {/* Paid - editable */}
              {editingCell?.id===o.id&&editingCell?.field==="paid_amount"
                ?<td style={{padding:"4px 6px"}}><input autoFocus type="number" value={cellValue} onChange={e=>setCellValue(e.target.value)} onBlur={()=>saveCell(o)} onKeyDown={e=>{if(e.key==="Enter")saveCell(o);if(e.key==="Escape")setEditingCell(null);}} style={{width:75,border:"1.5px solid #FF6B35",borderRadius:6,padding:"4px 6px",fontSize:12,fontFamily:"'Nunito',sans-serif",outline:"none"}}/></td>
                :<td onClick={()=>startEdit(o.id,"paid_amount",o.paid_amount)} style={{padding:"8px 10px",fontWeight:800,color:"#06D6A0",cursor:"pointer",whiteSpace:"nowrap"}}>{fmt(o.paid_amount||0)} <span style={{fontSize:9,color:"#C4B8AC"}}>✏️</span></td>}
              {/* Price */}
              <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35",whiteSpace:"nowrap"}}>{fmt(o.product_price||0)}</td>
              {/* Due - editable */}
              {editingCell?.id===o.id&&editingCell?.field==="due"
                ?<td style={{padding:"4px 6px"}}><input autoFocus type="number" value={cellValue} onChange={e=>setCellValue(e.target.value)} onBlur={()=>saveCell(o)} onKeyDown={e=>{if(e.key==="Enter")saveCell(o);if(e.key==="Escape")setEditingCell(null);}} style={{width:75,border:"1.5px solid #FF6B35",borderRadius:6,padding:"4px 6px",fontSize:12,fontFamily:"'Nunito',sans-serif",outline:"none"}}/></td>
                :<td onClick={()=>startEdit(o.id,"due",due)} style={{padding:"8px 10px",fontWeight:800,color:due>0?"#EF476F":"#06D6A0",cursor:"pointer",whiteSpace:"nowrap"}}>{fmt(due)} <span style={{fontSize:9,color:"#C4B8AC"}}>✏️</span></td>}
              {/* Courier - editable */}
              {editingCell?.id===o.id&&editingCell?.field==="courier"
                ?<td style={{padding:"4px 6px"}}><input autoFocus type="number" value={cellValue} onChange={e=>setCellValue(e.target.value)} onBlur={()=>saveCell(o)} onKeyDown={e=>{if(e.key==="Enter")saveCell(o);if(e.key==="Escape")setEditingCell(null);}} style={{width:75,border:"1.5px solid #FF6B35",borderRadius:6,padding:"4px 6px",fontSize:12,fontFamily:"'Nunito',sans-serif",outline:"none"}}/></td>
                :<td onClick={()=>startEdit(o.id,"courier",courier)} style={{padding:"8px 10px",fontWeight:800,color:"#3B82F6",cursor:"pointer",whiteSpace:"nowrap"}}>{fmt(courier)} <span style={{fontSize:9,color:"#C4B8AC"}}>✏️</span></td>}
              {/* Final = Due + Courier */}
              <td style={{padding:"8px 10px",fontWeight:800,color:"#1A1A2E",background:"#FFF8F0",whiteSpace:"nowrap"}}>{fmt(final_amt)}</td>
              {/* Actions */}
              <td style={{padding:"8px 10px"}}>
                <div style={{display:"flex",gap:5,alignItems:"center"}}>
                  {o.status==="delivered"
                    ?<Pill bg="#D1FAE5" color="#065F46">✅ Done</Pill>
                    :<button onClick={()=>updateStatus(o.id,"delivered")} style={{background:"#D1FAE5",color:"#065F46",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap"}}>✅ Done</button>}
                  {o.status!=="pathao_created"&&o.status!=="delivered"&&o.phone&&o.address&&
                    <button onClick={()=>createPathao(o.id)} disabled={creatingPathao===o.id} style={{background:"#FFF3ED",color:"#FF6B35",border:"1px solid #FFD9C7",borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:800,cursor:"pointer",whiteSpace:"nowrap",opacity:creatingPathao===o.id?.6:1}}>
                      {creatingPathao===o.id?"⏳":"🛵"}
                    </button>}
                  {o.delivery_id&&<Pill bg="#DBEAFE" color="#1E40AF">📦</Pill>}
                  <button onClick={()=>del(o.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>🗑️</button>
                </div>
              </td>
            </tr>;})}
        </tbody>
        </table></div>}
    </Card>
  </div>;
}



// ── ORDERS TAB ────────────────────────────────────────────────────────────────
function Orders({sales,deliveries,pendingOrders,products,reload,toast}){
  const [approving,setApproving]=useState(null);
  const [finalPrices,setFinalPrices]=useState({});
  const [selectedProducts,setSelectedProducts]=useState({});
  const [finalQtys,setFinalQtys]=useState({});

  const approvePending=async(id)=>{
    const fp=finalPrices[id];
    if(!fp){toast("❌ Enter final product price first!");return;}
    setApproving(id);
    try{
      const product_id=selectedProducts[id]?+selectedProducts[id]:null;
      const qty=finalQtys[id]?+finalQtys[id]:1;
      const r=await API.approveOrder(id,{final_price:+fp,product_id,qty});
      toast("✅ Approved! Pathao: "+(r.consignment_id||"pending"));
      reload();
    }catch(e){toast("❌ "+e.message);}
    finally{setApproving(null);}
  };

  const rejectPending=async(id)=>{
    if(!window.confirm("Reject this order?"))return;
    await API.rejectOrder(id);reload();toast("❌ Order rejected");
  };

  const pendingCount=pendingOrders.filter(o=>o.status==="pending").length;
  const [range,setRange]=useState("today");
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");

  const todayStr=()=>new Date().toISOString().split("T")[0];

  const inRange=d=>{
    if(!d)return false;
    const dt=new Date(d);
    const now=new Date();
    now.setHours(23,59,59);
    if(range==="today") return d.slice(0,10)===todayStr();
    if(range==="7d"){const s=new Date();s.setDate(s.getDate()-6);s.setHours(0,0,0);return dt>=s&&dt<=now;}
    if(range==="30d"){const s=new Date();s.setDate(s.getDate()-29);s.setHours(0,0,0);return dt>=s&&dt<=now;}
    if(range==="month"){const s=new Date(now.getFullYear(),now.getMonth(),1);return dt>=s&&dt<=now;}
    if(range==="custom")return(!from||dt>=new Date(from))&&(!to||dt<=new Date(to+"T23:59:59"));
    return true;
  };

  // Filter order form sales (payment = COD) and WooCommerce
  const orderSales=sales.filter(s=>
    (s.payment==="Cash on delivery (COD)"||s.payment==="Pathao COD"||s.payment==="Cash on delivery"||s.payment==="WooCommerce")
    && inRange(s.date)
  );
  const totalRev=orderSales.reduce((a,s)=>a+(+s.total||0),0);
  const totalProfit=orderSales.reduce((a,s)=>a+(+s.profit||0),0);

  // Group by date for daily breakdown
  const byDate={};
  orderSales.forEach(s=>{
    const d=s.date;
    if(!byDate[d])byDate[d]={date:d,count:0,revenue:0,profit:0};
    byDate[d].count++;
    byDate[d].revenue+=(+s.total||0);
    byDate[d].profit+=(+s.profit||0);
  });
  const dailyRows=Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date));

  // Source breakdown
  const fromForm=orderSales.filter(s=>s.sold_by==="Order Form").length;
  const fromWC=orderSales.filter(s=>s.payment==="WooCommerce"||s.payment==="Pathao COD").length;
  const fromCOD=orderSales.filter(s=>s.payment==="Cash on delivery (COD)"||s.payment==="Cash on delivery").length;

  const RANGES=[["today","Today"],["7d","7 Days"],["30d","30 Days"],["month","This Month"],["all","All Time"],["custom","Custom"]];

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    {/* Range filter */}
    <Card style={{padding:"12px 16px"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{fontSize:10,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase"}}>📅 Range</span>
        {RANGES.map(([id,lbl])=><button key={id} onClick={()=>setRange(id)} style={{border:"1.5px solid",borderColor:range===id?"#FF6B35":"#F0D9C0",background:range===id?"#FF6B35":"#FFFAF7",color:range===id?"#fff":"#6B7280",borderRadius:18,padding:"5px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Nunito',sans-serif"}}>{lbl}</button>)}
        {range==="custom"&&<div style={{display:"flex",gap:6,alignItems:"center"}}>
          <input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"'Nunito',sans-serif",background:"#FFFAF7",outline:"none"}}/>
          <span style={{color:"#9CA3AF"}}>→</span>
          <input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{border:"1.5px solid #F0D9C0",borderRadius:8,padding:"5px 8px",fontSize:12,fontFamily:"'Nunito',sans-serif",background:"#FFFAF7",outline:"none"}}/>
        </div>}
      </div>
    </Card>

    {/* Pending Orders - needs approval */}
    {pendingCount>0&&<Card style={{border:"2px solid #F59E0B",background:"#FFFBEB"}}>
      <CT>⏳ Pending Approval ({pendingCount}) <span style={{fontSize:11,color:"#92400E",fontWeight:700}}>Review & set final price before sending to Pathao</span></CT>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {pendingOrders.filter(o=>o.status==="pending").map(o=>{
          const isWC=o.source==="woocommerce";
          const wcItems=isWC&&o.wc_items?JSON.parse(o.wc_items):null;
          return <div key={o.id} style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:`1.5px solid ${isWC?"#BFDBFE":"#FDE68A"}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{fontWeight:800,fontSize:14}}>{o.customer_name}</span>
                <span style={{fontSize:11,color:"#9CA3AF",fontWeight:600}}>#{o.inv}</span>
                {isWC
                  ?<Pill bg="#DBEAFE" color="#1D4ED8">🛒 WooCommerce</Pill>
                  :<Pill bg="#FEF3C7" color="#92400E">📬 Order Form</Pill>}
              </div>
              <div style={{fontSize:12,color:"#6B7280",marginTop:2}}>📞 {o.customer_phone}</div>
              <div style={{fontSize:12,color:"#6B7280"}}>📍 {o.customer_address}</div>
              {wcItems
                ?<div style={{marginTop:6,background:"#EFF6FF",borderRadius:8,padding:"6px 10px"}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#1D4ED8",textTransform:"uppercase",marginBottom:3}}>WC Items</div>
                  {wcItems.map((item,i)=><div key={i} style={{fontSize:12,color:"#1E40AF",fontWeight:600}}>• {item}</div>)}
                </div>
                :<div style={{fontSize:12,color:"#1A1A2E",marginTop:4,fontWeight:700}}>📦 {o.product_details}</div>
              }
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:11,color:"#9CA3AF"}}>{o.created_at}</div>
              <Pill bg={o.delivery_type==="outside"?"#DBEAFE":"#D1FAE5"} color={o.delivery_type==="outside"?"#1E40AF":"#065F46"}>{o.delivery_type==="outside"?"🗺️ Outside ৳150":"🏙️ Inside ৳80"}</Pill>
              <div style={{fontSize:12,color:"#9CA3AF",marginTop:4}}>{isWC?"WC Total":"Customer stated"}: <b>{fmt(o.product_price)}</b></div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
            <div style={{flex:"1 1 120px"}}>
              <label style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",display:"block",marginBottom:4}}>Final Product Price (৳)</label>
              <input type="number" value={finalPrices[o.id]||o.product_price||""} onChange={e=>setFinalPrices(p=>({...p,[o.id]:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #F59E0B",borderRadius:8,padding:"8px 10px",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,outline:"none",background:"#FFFBEB"}}
                placeholder="Enter final price"/>
            </div>
            <div style={{flex:"0 1 80px"}}>
              <label style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",display:"block",marginBottom:4}}>Qty</label>
              <input type="number" min="1" value={finalQtys[o.id]||1} onChange={e=>setFinalQtys(p=>({...p,[o.id]:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #F0D9C0",borderRadius:8,padding:"8px 10px",fontFamily:"'Nunito',sans-serif",fontSize:14,fontWeight:700,outline:"none",background:"#FFFAF7"}}/>
            </div>
            <div style={{flex:"1 1 160px"}}>
              <label style={{fontSize:9,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",display:"block",marginBottom:4}}>Link Inventory Item (deducts stock)</label>
              <select value={selectedProducts[o.id]||""} onChange={e=>setSelectedProducts(p=>({...p,[o.id]:e.target.value}))}
                style={{width:"100%",border:"1.5px solid #F0D9C0",borderRadius:8,padding:"8px 10px",fontFamily:"'Nunito',sans-serif",fontSize:13,outline:"none",background:"#FFFAF7"}}>
                <option value="">— No deduction —</option>
                {products.map(p=><option key={p.id} value={p.id}>{p.emoji} {p.name} (stock: {p.stock}, buy: ৳{p.buy})</option>)}
              </select>
            </div>
            {finalPrices[o.id]&&<div style={{background:"#FFF8F0",borderRadius:8,padding:"8px 12px",fontSize:13,fontWeight:800,color:"#FF6B35",flexShrink:0}}>
              Total COD: {fmt((+finalPrices[o.id]||0)*(+finalQtys[o.id]||1)+(+o.delivery_charge||80))}
              {selectedProducts[o.id]&&(()=>{const p=products.find(p=>p.id===+selectedProducts[o.id]);return p?<div style={{fontSize:10,color:"#06D6A0",fontWeight:700,marginTop:2}}>Profit: {fmt(((+finalPrices[o.id]||0)-p.buy)*(+finalQtys[o.id]||1))}</div>:null;})()}
            </div>}
            <button onClick={()=>approvePending(o.id)} disabled={approving===o.id} style={{background:"linear-gradient(135deg,#06D6A0,#10B981)",color:"#fff",border:"none",borderRadius:8,padding:"9px 16px",fontFamily:"'Baloo 2',cursive",fontSize:13,fontWeight:800,cursor:"pointer",flexShrink:0,opacity:approving===o.id?.6:1}}>
              {approving===o.id?"⏳ Creating...":"✅ Approve & Send Pathao"}
            </button>
            <button onClick={()=>rejectPending(o.id)} style={{background:"#FEE2E2",color:"#991B1B",border:"none",borderRadius:8,padding:"9px 12px",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>❌ Reject</button>
          </div>
        </div>;})}
      </div>
    </Card>}

    {/* KPI */}
    <div className="grid4">
      <SC icon="📬" label="Total Orders" value={orderSales.length} accent="#FF6B35"/>
      <SC icon="💰" label="Revenue" value={fmt(totalRev)} accent="#06D6A0"/>
      <SC icon="📈" label="Profit" value={fmt(totalProfit)} accent="#8B5CF6"/>
      <SC icon="🛵" label="Sources" value={fromForm+" Form / "+fromWC+" Web"} accent="#3B82F6"/>
    </div>

    <div className="split">
      {/* Daily breakdown */}
      <Card>
        <CT>📅 Daily Breakdown</CT>
        {dailyRows.length===0?<Empty msg="No orders in this period"/>:
        <div className="ovx"><table>
          <thead><TH cols={["Date","Orders","Revenue","Profit"]}/></thead>
          <tbody>{dailyRows.map(r=><tr key={r.date} style={{borderBottom:"1px solid #F9F0E8"}}>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:12}}>{r.date}</td>
            <td style={{padding:"8px 10px",fontWeight:700}}>{r.count}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(r.revenue)}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#06D6A0"}}>{fmt(r.profit)}</td>
          </tr>)}</tbody>
        </table></div>}
      </Card>

      {/* Source breakdown */}
      <Card>
        <CT>🔍 Order Sources</CT>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[
            ["📬 Order Form",fromForm,orderSales.filter(s=>s.sold_by==="Order Form").reduce((a,s)=>a+(+s.total||0),0),"#FF6B35"],
            ["🛒 WooCommerce",fromWC,orderSales.filter(s=>s.payment==="WooCommerce"||s.payment==="Pathao COD").reduce((a,s)=>a+(+s.total||0),0),"#3B82F6"],
            ["💵 COD Walk-in",fromCOD,orderSales.filter(s=>s.payment==="Cash on delivery (COD)"||s.payment==="Cash on delivery").reduce((a,s)=>a+(+s.total||0),0),"#06D6A0"],
          ].map(([label,count,rev,color])=><div key={label} style={{background:"#FFF8F0",borderRadius:10,padding:"12px 14px",border:"1px solid #F0E6D3"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontWeight:700,fontSize:13}}>{label}</span>
              <span style={{fontFamily:"'Inter',sans-serif",fontWeight:800,color,fontSize:16}}>{count} orders</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#9CA3AF"}}>
              <span>Revenue</span><span style={{fontWeight:800,color:"#1A1A2E"}}>{fmt(rev)}</span>
            </div>
            <Bar value={rev} max={Math.max(totalRev,1)} color={color}/>
          </div>)}
        </div>
      </Card>
    </div>

    {/* Customer details */}
    <Card>
      <CT>👥 Customer Orders ({orderSales.length})</CT>
      <div className="ovx"><table>
        <thead><TH cols={["Date","Customer","Phone","Product","Qty","Total","Payment","Source"]}/></thead>
        <tbody>
          {orderSales.length===0&&<tr><td colSpan={7}><Empty msg="No orders in this period"/></td></tr>}
          {orderSales.map(s=><tr key={s.id} style={{borderBottom:"1px solid #F9F0E8"}} onMouseEnter={e=>e.currentTarget.style.background="#FFF8F0"} onMouseLeave={e=>e.currentTarget.style.background=""}>
            <td style={{padding:"8px 10px",color:"#9CA3AF",fontSize:11,whiteSpace:"nowrap"}}>{s.date}</td>
            <td style={{padding:"8px 10px",fontWeight:700,fontSize:12}}>{s.customer}</td>
            <td style={{padding:"8px 10px",fontSize:12,whiteSpace:"nowrap"}}>{s.phone||"—"}</td>
            <td style={{padding:"8px 10px",fontSize:12,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.emoji} {s.product_name}</td>
            <td style={{padding:"8px 10px"}}>{s.qty}</td>
            <td style={{padding:"8px 10px",fontWeight:800,color:"#FF6B35"}}>{fmt(s.total)}</td>
            <td style={{padding:"8px 10px"}}><Pill bg="#DBEAFE" color="#1E40AF">{s.payment}</Pill></td>
            <td style={{padding:"8px 10px"}}><Pill bg="#FFF3ED" color="#FF6B35">{s.sold_by||"—"}</Pill></td>
          </tr>)}
        </tbody>
      </table></div>
    </Card>
  </div>;
}

// ── SETTINGS ─────────────────────────────────────────────────────────────────
function Settings({toast}){
  const [sending,setSending]=useState(false);
  const host=window.location.hostname;
  const webhookUrl=`https://${host}/api/webhook/pathao`;

  const testReport=async()=>{
    setSending(true);
    try{
      await API.sendReport();
      toast("✅ Report sent! Check your email.");
    }catch(e){toast("❌ "+e.message);}
    finally{setSending(false);}
  };

  return <div style={{display:"flex",flexDirection:"column",gap:16}}>
    <Card>
      <CT>🛵 Pathao Webhook Setup</CT>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:"#FFF8F0",borderRadius:11,padding:14,border:"1.5px solid #F0D9C0"}}>
          <div style={{fontSize:10,fontWeight:800,color:"#9CA3AF",textTransform:"uppercase",marginBottom:8}}>Your Webhook URL</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <code style={{flex:1,background:"#1A1A2E",color:"#06D6A0",padding:"10px 14px",borderRadius:9,fontSize:13,fontFamily:"monospace",wordBreak:"break-all"}}>{webhookUrl}</code>
            <button onClick={()=>{navigator.clipboard.writeText(webhookUrl);toast("✅ Copied!");}} style={{background:"#EDE9FE",color:"#5B21B6",border:"none",borderRadius:9,padding:"10px 14px",cursor:"pointer",fontWeight:800,fontSize:12,flexShrink:0}}>📋 Copy</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontWeight:800,fontSize:13}}>How to set up in Pathao:</div>
          {[
            ["1","Login to merchant.pathao.com"],
            ["2","Go to Settings → API / Webhook"],
            ["3","Paste the webhook URL above"],
            ["4","Save — Pathao will now auto-update delivery status in your dashboard"],
          ].map(([n,t])=><div key={n} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:"#FFF8F0",borderRadius:9,border:"1px solid #F0D9C0"}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:"#FF6B35",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,flexShrink:0}}>{n}</div>
            <div style={{fontSize:13}}>{t}</div>
          </div>)}
        </div>
        <div style={{background:"#D1FAE5",borderRadius:11,padding:12,border:"1.5px solid #BBF7D0"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#065F46"}}>✅ What webhook does automatically:</div>
          <div style={{fontSize:12,color:"#065F46",marginTop:4}}>When Pathao rider picks up, delivers, or fails — your dashboard updates instantly. Cancelled deliveries automatically remove the sale from your revenue.</div>
        </div>
      </div>
    </Card>

    <Card>
      <CT>📧 Daily Email Report</CT>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{background:"#FFF8F0",borderRadius:11,padding:14,border:"1.5px solid #F0D9C0"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#1A1A2E",marginBottom:6}}>⏰ Auto-sends every morning at 8:00 AM</div>
          <div style={{fontSize:12,color:"#6B7280"}}>Report includes: yesterday's revenue, profit, walk-in vs Pathao breakdown, pending deliveries, low stock alerts.</div>
        </div>
        <div style={{background:"#FEF3C7",borderRadius:11,padding:12,border:"1.5px solid #FDE68A"}}>
          <div style={{fontSize:12,fontWeight:700,color:"#92400E",marginBottom:4}}>⚙️ To configure email:</div>
          <div style={{fontSize:12,color:"#92400E",marginBottom:8}}>Edit your <code style={{background:"#fff",padding:"1px 6px",borderRadius:4}}>docker-compose.yml</code> and set:</div>
          <code style={{display:"block",background:"#1A1A2E",color:"#FFD166",padding:"10px 14px",borderRadius:9,fontSize:12,fontFamily:"monospace"}}>
            EMAIL_USER: your_gmail@gmail.com<br/>
            EMAIL_PASS: your_app_password<br/>
            EMAIL_REPORT_TO: razib@gmail.com
          </code>
          <div style={{fontSize:11,color:"#92400E",marginTop:8}}>Get App Password: Google Account → Security → 2-Step Verification → App Passwords</div>
        </div>
        <div>
          <Btn onClick={testReport} style={{opacity:sending?.6:1}}>
            {sending?"⏳ Sending...":"📧 Send Test Report Now"}
          </Btn>
          <div style={{fontSize:11,color:"#9CA3AF",marginTop:6}}>Sends yesterday's report to your configured email right now.</div>
        </div>
      </div>
    </Card>

    <Card>
      <CT>🔑 API Credentials</CT>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {[
          ["Pathao Client ID", "nXe0R0vbxr"],
          ["Pathao Store ID", "76249"],
          ["Pathao Zone", "Mirpur 12 (ID: 57)"],
          ["Pathao City", "Dhaka (ID: 1)"],
          ["Sender Phone", "01839000021"],
        ].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:"#FFF8F0",borderRadius:9,border:"1px solid #F0E6D3"}}>
          <span style={{fontSize:12,fontWeight:700,color:"#6B7280"}}>{l}</span>
          <code style={{fontSize:12,color:"#1A1A2E",fontFamily:"monospace"}}>{v}</code>
        </div>)}
      </div>
    </Card>
  </div>;
}

// ── ROOT ─────────────────────────────────────────────────────────────────────
export default function App(){
  const [user,setUser]=useState(()=>loadSession());
  const [products,setProducts]=useState([]);const [sales,setSales]=useState([]);
  const [expenses,setExpenses]=useState([]);const [purchases,setPurchases]=useState([]);
  const [cats,setCats]=useState([]);const [stakeholders,setStakeholders]=useState([]);const [users,setUsers]=useState([]);const [deliveries,setDeliveries]=useState([]);const [pendingOrders,setPendingOrders]=useState([]);const [deliveryStats,setDeliveryStats]=useState([]);const [stockHistory,setStockHistory]=useState([]);
  const [tab,setTab]=useState(()=>{const u=loadSession();return u?(ROLE_PERMS[u.role]||ROLE_PERMS.Staff).tabs[0]:"dashboard"});
  const [toast,setToast]=useState(null);const [menuOpen,setMenuOpen]=useState(false);
  const t=msg=>setToast(msg);



  const loadAll=useCallback(async()=>{
    const safe=(p)=>p.catch(e=>{console.warn("Fetch failed:",e.message);return null;});
    const [p,s,e,pu,c,sh,u,dv,ds,sth,pord]=await Promise.all([
      safe(API.getProducts()),safe(API.getSales()),safe(API.getExpenses()),
      safe(API.getPurchases()),safe(API.getCategories()),safe(API.getStakeholders()),
      safe(API.getUsers()),safe(API.getDeliveries()),safe(API.getDeliveryStats()),
      safe(API.getStockHistory()),safe(API.getPendingOrders())
    ]);
    if(p)setProducts(p);if(s)setSales(s);if(e)setExpenses(e);
    if(pu)setPurchases(pu);if(c)setCats(c);if(sh)setStakeholders(sh);
    if(u)setUsers(u);if(dv)setDeliveries(dv);if(ds)setDeliveryStats(ds);
    if(sth)setStockHistory(sth);if(pord)setPendingOrders(pord);
  },[]);

  // Load data on login, retry if fails
  useEffect(()=>{
    if(!user)return;
    let cancelled=false;
    const tryLoad=async(delay=0)=>{
      if(cancelled)return;
      if(delay)await new Promise(r=>setTimeout(r,delay));
      if(cancelled)return;
      await loadAll();
      // Retry after 3s in case some endpoints were not ready
      if(!cancelled)setTimeout(()=>!cancelled&&loadAll(),3000);
    };
    tryLoad();
    return()=>{cancelled=true;};
  },[user]);

  // Auto-refresh data every 60 seconds
  useEffect(()=>{
    if(!user)return;
    const interval=setInterval(()=>loadAll(),60000);
    return()=>clearInterval(interval);
  },[user,loadAll]);

  const doLogin=u=>{saveSession(u);setUser(u);const p=ROLE_PERMS[u.role]||ROLE_PERMS.Staff;setTab(p.tabs[0]);setMenuOpen(false)};
  const doLogout=()=>{clearSession();setUser(null);setTab("dashboard");setMenuOpen(false)};

  if(!user)return <Login onLogin={doLogin}/>;

;

  const perms=ROLE_PERMS[user.role]||ROLE_PERMS.Staff;
  const ALL_TABS=[
    {id:"dashboard",label:"Dashboard",icon:"📊"},
    {id:"purchases",label:"Purchases",icon:"🚢"},
    {id:"inventory",label:"Inventory",icon:"📦"},
    {id:"sales",label:"Sales",icon:"💰"},
    {id:"expenses",label:"Expenses",icon:"🧾"},
    {id:"reports",label:"Reports",icon:"📈"},
    {id:"categories",label:"Categories",icon:"🏷️"},
    {id:"stakeholders",label:"Stakeholders",icon:"🤝"},
    {id:"users",label:"Users",icon:"👥"},
    {id:"deliveries",label:"Deliveries",icon:"🛵"},
    {id:"stock-history",label:"Stock Log",icon:"📋"},
    {id:"woocommerce",label:"WooCommerce",icon:"🛒"},
    {id:"preorders",label:"Pre-Orders",icon:"📋"},
    {id:"orders",label:"Orders",icon:"📬"},
  ];
  const TABS=ALL_TABS.filter(tb=>perms.tabs.includes(tb.id));
  const at=TABS.find(tb=>tb.id===tab)?tab:TABS[0]?.id;
  const dateStr=new Date().toLocaleDateString("en-BD",{weekday:"short",year:"numeric",month:"short",day:"numeric"});

  return <div style={{minHeight:"100vh"}}>
    <style>{css}</style>

    {/* HEADER */}
    <div style={{background:"rgba(255,255,255,.85)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderBottom:"1px solid #E5E5EA",padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:52,position:"sticky",top:0,zIndex:100}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:30,height:30,borderRadius:8,background:"#FF6B35",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>🎮</div>
        <span style={{fontSize:15,fontWeight:700,color:"#1D1D1F",letterSpacing:"-.02em"}}>The Hobby Center</span>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div className="hide-mobile" style={{fontSize:12,color:"#6E6E73",fontWeight:500}}>{dateStr}</div>
        <div style={{display:"flex",alignItems:"center",gap:7,background:"#F5F5F7",borderRadius:20,padding:"5px 12px 5px 8px",border:"1px solid #E5E5EA"}}>
          <span style={{fontSize:15}}>{user.emoji}</span>
          <div className="hide-mobile"><span style={{fontSize:13,fontWeight:600,color:"#1D1D1F",letterSpacing:"-.01em"}}>{user.name}</span><span style={{fontSize:11,color:"#6E6E73",fontWeight:500,marginLeft:5}}> · {user.role}</span></div>
        </div>
        <button onClick={doLogout} style={{background:"#F2F2F7",color:"#3C3C43",border:"1px solid #E5E5EA",borderRadius:10,padding:"6px 14px",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:600}}>Sign Out</button>
      </div>
    </div>

    {/* TAB BAR */}
    <div className="tabbar" style={{background:"rgba(255,255,255,.9)",backdropFilter:"blur(20px)",borderBottom:"1px solid #E5E5EA",display:"flex",overflowX:"auto",padding:"0 16px",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
      <style>{`.tabbar::-webkit-scrollbar{display:none}`}</style>
      {TABS.map(tb=><button key={tb.id} onClick={()=>setTab(tb.id)} style={{padding:"12px 14px",border:"none",background:"none",fontFamily:"inherit",fontSize:12,fontWeight:600,color:at===tb.id?"#FF6B35":"#6E6E73",borderBottom:at===tb.id?"2px solid #FF6B35":"2px solid transparent",cursor:"pointer",whiteSpace:"nowrap",marginBottom:-1,flexShrink:0,letterSpacing:"-.01em",transition:"color .15s"}}>{tb.icon} {tb.label}</button>)}
    </div>

    {/* CONTENT */}
    <div className="print-area" style={{padding:"16px",maxWidth:1440,margin:"0 auto"}}>
      {at==="dashboard"&&<Dashboard products={products} sales={sales} expenses={expenses} purchases={purchases} deliveries={deliveries} deliveryStats={deliveryStats}/>}
      {at==="purchases"&&<Purchases purchases={purchases} products={products} reload={loadAll} toast={t}/>}
      {at==="inventory"&&<Inventory products={products} reload={loadAll} cats={cats} toast={t}/>}
      {at==="sales"&&<Sales products={products} sales={sales} reload={loadAll} perms={perms} user={user} toast={t}/>}
      {at==="expenses"&&<Expenses expenses={expenses} reload={loadAll} toast={t}/>}
      {at==="reports"&&<Reports products={products} sales={sales} expenses={expenses} purchases={purchases}/>}
      {at==="categories"&&<Categories cats={cats} reload={loadAll} products={products} toast={t}/>}
      {at==="stakeholders"&&<Stakeholders stakeholders={stakeholders} sales={sales} expenses={expenses} reload={loadAll} toast={t}/>}
      {at==="users"&&<Users users={users} reload={loadAll} currentUser={user} toast={t}/>}
      {at==="deliveries"&&<Deliveries deliveries={deliveries} products={products} sales={sales} reload={loadAll} toast={t}/>}

      {at==="woocommerce"&&<WooCommerce toast={t}/>}
      {at==="preorders"&&<PreOrders toast={t}/>}
      {at==="orders"&&<Orders sales={sales} deliveries={deliveries} pendingOrders={pendingOrders} products={products} reload={loadAll} toast={t}/>}
      {at==="fb-orders"&&<FBOrders sales={sales} toast={t}/>}
      {at==="stock-history"&&<StockHistory stockHistory={stockHistory} products={products} reload={loadAll}/>}
    </div>

    {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
  </div>;
}
