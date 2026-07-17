import { useState, useRef } from "react";

const C = {
  bg:"#FFFFFF", surface:"#F7F7F7", border:"#EBEBEB",
  subtle:"#ABABAB", secondary:"#6B6B6B", primary:"#111111",
  green:"#16A34A", greenBg:"#F0FDF4",
  orange:"#D97706", orangeBg:"#FFFBEB",
  red:"#DC2626", redBg:"#FFF2F2",
};
const F = "-apple-system,'SF Pro Text','Segoe UI',sans-serif";

const P: Record<string,string> = {
  home:"M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  visit:"M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  clients:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 7a4 4 0 100 8 4 4 0 000-8z",
  finance:"M12 1v22 M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6",
  supply:"M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
  shift:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 14l2 2 4-4",
  book:"M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  shield:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  check:"M5 13l4 4L19 7",
  plus:"M12 5v14 M5 12h14",
  arrow:"M19 12H5 M12 5l-7 7 7 7",
  camera:"M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z M12 17a4 4 0 100-8 4 4 0 000-8z",
  team:"M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 3a4 4 0 100 8 4 4 0 000-8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  settings:"M12 15a3 3 0 100-6 3 3 0 000 6z",
  logout:"M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  link:"M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71 M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
  upload:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
  more:"M5 12h.01 M12 12h.01 M19 12h.01",
  msg:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  doc:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  trash:"M3 6h18 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6 M10 11v6 M14 11v6",
  photo:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7",
  bell:"M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 01-3.46 0",
  edit:"M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
};

function Icon({name,size=20,color=C.secondary,sw=1.7}:{name:string;size?:number;color?:string;sw?:number}){
  return(
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {(P[name]||"").split(" M").map((d,i)=><path key={i} d={(i===0?"":"M")+d}/>)}
    </svg>
  );
}

const cs = (base: React.CSSProperties, ...rest: React.CSSProperties[]) => Object.assign({}, base, ...rest);

function Card({children,style={},onClick}:{children:React.ReactNode;style?:React.CSSProperties;onClick?:()=>void}){
  return <div onClick={onClick} style={cs({background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:12},style)}>{children}</div>;
}
function ST({children}:{children:React.ReactNode}){
  return <div style={{fontSize:11,fontWeight:700,color:C.subtle,letterSpacing:"0.8px",textTransform:"uppercase" as const,marginBottom:10}}>{children}</div>;
}
function BackBtn({onClick,label="Назад"}:{onClick:()=>void;label?:string}){
  return <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",color:C.secondary,fontSize:14,fontFamily:F,marginBottom:20,padding:0}}><Icon name="arrow" size={16} color={C.secondary}/>{label}</button>;
}
function Badge({children,color,bg}:{children:React.ReactNode;color:string;bg:string}){
  return <span style={{background:bg,color,padding:"3px 8px",borderRadius:6,fontSize:11,fontWeight:700}}>{children}</span>;
}
function Btn({children,onClick,variant="primary",small=false,style={}}:{children:React.ReactNode;onClick?:()=>void;variant?:string;small?:boolean;style?:React.CSSProperties}){
  const bg=variant==="primary"?C.primary:variant==="green"?C.green:variant==="red"?C.red:C.surface;
  const col=(variant==="primary"||variant==="green"||variant==="red")?"#FFF":C.primary;
  return(
    <button onClick={onClick} style={cs({width:small?"auto":"100%",background:bg,color:col,border:variant==="secondary"?`1px solid ${C.border}`:"none",borderRadius:12,padding:small?"8px 16px":"14px",fontSize:small?13:15,fontWeight:700,cursor:"pointer",fontFamily:F},style)}>{children}</button>
  );
}

function PeriodFilter({value,onChange,includeToday=true}:{value:string;onChange:(v:string)=>void;includeToday?:boolean}){
  const opts=includeToday?[["today","Сегодня"],["week","Неделя"],["month","Месяц"]]:[["week","Неделя"],["month","Месяц"]];
  return(
    <div style={{display:"flex",background:C.surface,borderRadius:12,padding:3,marginBottom:16}}>
      {opts.map(([k,l])=>(
        <button key={k} onClick={()=>onChange(k)} style={{flex:1,padding:"8px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,background:value===k?C.bg:"transparent",color:value===k?C.primary:C.subtle,fontSize:13,fontWeight:value===k?700:400,boxShadow:value===k?"0 1px 3px rgba(0,0,0,0.08)":"none"}}>{l}</button>
      ))}
    </div>
  );
}

// ── DATA ──────────────────────────────────────────────────────────
const STUDIOS=[{id:1,name:"Студия на Тверской",address:"ул. Тверская, 15"},{id:2,name:"Студия на Арбате",address:"ул. Арбат, 28"}];
const MASTERS_DATA=[
  {id:3,name:"Мария Смирнова",tg:"@maria_m",pct:40,active:true},
  {id:4,name:"Ольга Тихонова",tg:"@olga_t",pct:40,active:true},
];
const VISITS_DATA=[
  {id:1,lastName:"Козлова",firstName:"Анна",phone:"+7 916 123-45-67",master:"Мария Смирнова",service:"Маникюр + гель",materials:"Гель-лак №47, топ",price:2800,discountPct:0,date:"2026-07-14",time:"10:00",photoBefore:"📷",photoAfter:"📷",studio:1},
  {id:2,lastName:"Морозова",firstName:"Светлана",phone:"+7 905 987-65-43",master:"Ольга Тихонова",service:"Педикюр",materials:"Пилки, крем",price:1900,discountPct:10,date:"2026-07-14",time:"11:30",photoBefore:"📷",photoAfter:"📷",studio:1},
  {id:3,lastName:"Петрова",firstName:"Юлия",phone:"+7 926 555-12-34",master:"Мария Смирнова",service:"Коррекция",materials:"Пилки",price:1500,discountPct:0,date:"2026-07-13",time:"13:00",photoBefore:"",photoAfter:"📷",studio:1},
  {id:4,lastName:"Васильева",firstName:"Наталья",phone:"+7 903 222-33-44",master:"Ольга Тихонова",service:"Наращивание",materials:"Типсы, гель",price:3500,discountPct:0,date:"2026-07-12",time:"14:30",photoBefore:"📷",photoAfter:"📷",studio:2},
  {id:5,lastName:"Козлова",firstName:"Анна",phone:"+7 916 123-45-67",master:"Мария Смирнова",service:"Маникюр",materials:"Гель-лак №12",price:2500,discountPct:0,date:"2026-06-30",time:"11:00",photoBefore:"📷",photoAfter:"📷",studio:1},
];
const SUPPLIES_DATA=[
  {id:1,name:"Гель-лак Kodi (набор)",cat:"Маникюр",qty:3,min:2,unit:"шт",link:"https://kodicom.ru"},
  {id:2,name:"Топ без л/с",cat:"Маникюр",qty:1,min:2,unit:"шт",link:""},
  {id:3,name:"Пилки 180/180",cat:"Маникюр",qty:8,min:5,unit:"шт",link:""},
  {id:4,name:"Кофе Lavazza",cat:"Кухня",qty:2,min:1,unit:"кг",link:"https://lavazza.ru"},
];
const KNOWLEDGE_DATA=[
  {id:1,cat:"Стандарты",title:"Протокол встречи клиента",body:"1. Поприветствовать по имени\n2. Предложить кофе или воду\n3. Провести к рабочему месту"},
  {id:2,cat:"Мастерам",title:"Протокол стерилизации",body:"1. Очистить инструмент\n2. Дезраствор 60 минут\n3. Промыть водой\n4. Сухожар\n5. Крафт-пакет с датой"},
  {id:3,cat:"Правила",title:"Дресс-код",body:"— Чёрный медицинский костюм\n— Закрытая обувь\n— Минимум украшений"},
];
const DOC_SECTIONS=[
  {cat:"Регистрационные",items:["Лист записи ЕГРИП/ЕГРЮЛ","ИНН","Уведомление о начале деятельности","Договор аренды"]},
  {cat:"Санитарные",items:["Журнал стерилизации","Журнал уборки","График генеральных уборок","ППК","Договор на вывоз ТБО"]},
  {cat:"Пожарная безопасность",items:["План эвакуации","Приказ об ответственном","Журнал огнетушителей"]},
  {cat:"Оборудование",items:["Сертификаты ЕАС","Инструкции на русском","Акты ввода в эксплуатацию"]},
  {cat:"Персонал",items:["Трудовые договоры","СОУТ","Журнал инструктажа","Медкнижки"]},
  {cat:"Персональные данные",items:["Уведомление Роскомнадзора","Политика конфиденциальности","Согласия клиентов"]},
];
const VIOLATIONS_DATA=[
  {id:1,name:"Подмена трудовых отношений",risk:10,done:false,deadline:"30 дней",free:false},
  {id:2,name:"Согласие на обработку ПД",risk:9,done:true,deadline:"1 день",free:true},
  {id:3,name:"Пожарная сигнализация",risk:9,done:false,deadline:"30 дней",free:false},
  {id:4,name:"Уведомление в Роскомнадзор",risk:9,done:true,deadline:"1 день",free:true},
  {id:5,name:"Журнал стерилизации",risk:9,done:false,deadline:"1 день",free:true},
];
const DEFAULT_OPEN=["Проверить чистоту рабочих мест","Включить освещение","Проверить расходники","Открыть запись в DIKIDI","Включить музыку","Проверить кофейную зону"];
const DEFAULT_CLOSE=["Закрыть смену в терминале","Прибрать рабочие места","Вынести мусор","Прибрать кофейную зону","Выключить свет и технику","Закрыть запись в DIKIDI"];

// ── SHARED COMPONENTS ─────────────────────────────────────────────
function Supplies(){
  const [items,setItems]=useState(SUPPLIES_DATA);
  const [filter,setFilter]=useState("Все");
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",cat:"Маникюр",qty:"",min:"",unit:"шт",link:""});
  const cats=["Все","Маникюр","Кухня"];
  const list=filter==="Все"?items:items.filter(s=>s.cat===filter);

  if(showAdd) return(
    <div>
      <BackBtn onClick={()=>setShowAdd(false)}/>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Новый расходник</div>
      {[{l:"Название",k:"name",p:"Гель-лак Kodi"},{l:"Количество",k:"qty",p:"5",t:"number"},{l:"Минимум (порог)",k:"min",p:"2",t:"number"},{l:"Единица",k:"unit",p:"шт"},{l:"Ссылка на товар",k:"link",p:"https://..."}].map(f=>(
        <div key={f.k} style={{marginBottom:14}}>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>{f.l}</div>
          <input type={f.t||"text"} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder={f.p} value={(form as any)[f.k]} onChange={(e:any)=>setForm(p=>({...p,[f.k]:e.target.value}))}/>
        </div>
      ))}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Категория</div>
        <div style={{display:"flex",gap:8}}>{["Маникюр","Кухня"].map(c=><button key={c} onClick={()=>setForm(p=>({...p,cat:c}))} style={{flex:1,padding:"11px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,background:form.cat===c?C.primary:C.surface,color:form.cat===c?"#FFF":C.secondary,fontWeight:600}}>{c}</button>)}</div>
      </div>
      <Btn onClick={()=>{if(!form.name.trim())return;setItems(p=>[...p,{id:Date.now(),name:form.name,cat:form.cat,qty:parseInt(form.qty)||0,min:parseInt(form.min)||0,unit:form.unit||"шт",link:form.link}]);setShowAdd(false);setForm({name:"",cat:"Маникюр",qty:"",min:"",unit:"шт",link:""});}}>Добавить</Btn>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800}}>Склад расходников</div>
        <button onClick={()=>setShowAdd(true)} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Добавить</button>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>{cats.map(c=><button key={c} onClick={()=>setFilter(c)} style={{padding:"7px 16px",borderRadius:20,fontSize:13,cursor:"pointer",border:"none",fontWeight:500,fontFamily:F,background:filter===c?C.primary:C.surface,color:filter===c?"#FFF":C.secondary}}>{c}</button>)}</div>
      <Card style={{padding:0}}>
        {list.map((s,i)=>{
          const low=s.qty<=s.min;
          return(
            <div key={s.id} style={{padding:"14px 16px",borderBottom:i<list.length-1?`1px solid ${C.border}`:"none"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:low?C.red:C.green,flexShrink:0}}/>
                  <div><div style={{fontSize:14,fontWeight:500}}>{s.name}</div><div style={{fontSize:12,color:C.subtle}}>мин. {s.min} {s.unit}</div></div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  {low&&<Badge color={C.red} bg={C.redBg}>Мало</Badge>}
                  <div style={{fontSize:16,fontWeight:800,color:low?C.red:C.primary}}>{s.qty} {s.unit}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>setItems(p=>p.map(x=>x.id===s.id?{...x,qty:x.qty+1}:x))} style={{background:C.greenBg,border:`1px solid ${C.green}33`,borderRadius:8,padding:"6px 12px",fontSize:12,color:C.green,cursor:"pointer",fontFamily:F,fontWeight:600}}>+ Пришло</button>
                <button onClick={()=>setItems(p=>p.map(x=>x.id===s.id?{...x,qty:Math.max(0,x.qty-1)}:x))} style={{background:C.redBg,border:`1px solid ${C.red}33`,borderRadius:8,padding:"6px 12px",fontSize:12,color:C.red,cursor:"pointer",fontFamily:F,fontWeight:600}}>− Списать</button>
                {s.link&&<button onClick={()=>window.open(s.link,"_blank")} style={{display:"flex",alignItems:"center",gap:4,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,color:C.secondary,cursor:"pointer",fontFamily:F}}><Icon name="link" size={12} color={C.secondary}/>Купить</button>}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function Knowledge({canEdit=false}:{canEdit?:boolean}){
  const [articles,setArticles]=useState(KNOWLEDGE_DATA);
  const [sel,setSel]=useState<typeof KNOWLEDGE_DATA[0]|null>(null);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({cat:"Стандарты",title:"",body:""});
  const cats=[...new Set(articles.map(a=>a.cat))];

  if(sel) return(
    <div>
      <BackBtn onClick={()=>setSel(null)}/>
      <div style={{fontSize:11,fontWeight:700,color:C.subtle,letterSpacing:"0.8px",textTransform:"uppercase" as const,marginBottom:6}}>{sel.cat}</div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>{sel.title}</div>
      <Card><div style={{fontSize:15,color:C.secondary,lineHeight:1.7,whiteSpace:"pre-line"}}>{sel.body}</div></Card>
    </div>
  );

  if(showForm&&canEdit) return(
    <div>
      <BackBtn onClick={()=>setShowForm(false)}/>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Новая статья</div>
      <div style={{marginBottom:14}}>
        <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Раздел</div>
        <select style={{width:"100%",background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F,appearance:"none" as any,boxSizing:"border-box" as const}} value={form.cat} onChange={(e:any)=>setForm(p=>({...p,cat:e.target.value}))}>
          {[...cats,"+ Новый раздел"].map(c=><option key={c}>{c}</option>)}
        </select>
      </div>
      <div style={{marginBottom:14}}><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Заголовок</div><input style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} value={form.title} onChange={(e:any)=>setForm(p=>({...p,title:e.target.value}))} placeholder="Название статьи"/></div>
      <div style={{marginBottom:20}}><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Содержание</div><textarea style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F,minHeight:160,resize:"vertical" as const}} value={form.body} onChange={(e:any)=>setForm(p=>({...p,body:e.target.value}))} placeholder="Текст статьи..."/></div>
      <Btn onClick={()=>{if(!form.title.trim()||!form.body.trim())return;setArticles(p=>[...p,{id:Date.now(),...form}]);setShowForm(false);setForm({cat:"Стандарты",title:"",body:""});}}>Сохранить</Btn>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>База знаний</div>
        {canEdit&&<button onClick={()=>setShowForm(true)} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Добавить</button>}
      </div>
      {!canEdit&&<div style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:12,color:C.subtle}}>Редактирование доступно только владельцу студии</div>}
      {cats.map(cat=>(
        <div key={cat} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:700,color:C.subtle,letterSpacing:"0.8px",textTransform:"uppercase" as const,marginBottom:8}}>{cat}</div>
          <Card style={{padding:0}}>
            {articles.filter(a=>a.cat===cat).map((a,i,arr)=>(
              <div key={a.id} onClick={()=>setSel(a)} style={{padding:"14px 16px",cursor:"pointer",borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:15}}>{a.title}</span><span style={{fontSize:20,color:C.border}}>›</span>
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  );
}

function Shift({canEdit=false,openList,closeList,onSaveLists}:{canEdit?:boolean;openList:string[];closeList:string[];onSaveLists?:(o:string[],c:string[])=>void}){
  const [tab,setTab]=useState<"open"|"close">("open");
  const [checked,setChecked]=useState<{open:number[];close:number[]}>({open:[],close:[]});
  const [editing,setEditing]=useState(false);
  const [editOpen,setEditOpen]=useState([...openList]);
  const [editClose,setEditClose]=useState([...closeList]);
  const [newItem,setNewItem]=useState("");
  const list=tab==="open"?openList:closeList;
  const done=checked[tab].length;
  const pct=list.length>0?Math.round(done/list.length*100):0;

  if(editing&&canEdit) return(
    <div>
      <BackBtn onClick={()=>setEditing(false)} label="Назад"/>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Редактировать чек-лист</div>
      <div style={{display:"flex",background:C.surface,borderRadius:12,padding:3,marginBottom:20}}>
        {(["open","close"] as const).map(k=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,background:tab===k?C.bg:"transparent",color:tab===k?C.primary:C.subtle,fontSize:14,fontWeight:tab===k?700:400}}>{k==="open"?"Открытие":"Закрытие"}</button>
        ))}
      </div>
      <Card style={{padding:0}}>
        {(tab==="open"?editOpen:editClose).map((item,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:`1px solid ${C.border}`}}>
            <span style={{flex:1,fontSize:14}}>{item}</span>
            <button onClick={()=>{if(tab==="open")setEditOpen(p=>p.filter((_,j)=>j!==i));else setEditClose(p=>p.filter((_,j)=>j!==i));}} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon name="trash" size={16} color={C.red}/></button>
          </div>
        ))}
      </Card>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <input style={{flex:1,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:14,color:C.primary,outline:"none",fontFamily:F}} placeholder="Новый пункт..." value={newItem} onChange={(e:any)=>setNewItem(e.target.value)} onKeyDown={(e:any)=>{if(e.key==="Enter"&&newItem.trim()){if(tab==="open")setEditOpen(p=>[...p,newItem.trim()]);else setEditClose(p=>[...p,newItem.trim()]);setNewItem("");}}}/>
        <Btn small onClick={()=>{if(!newItem.trim())return;if(tab==="open")setEditOpen(p=>[...p,newItem.trim()]);else setEditClose(p=>[...p,newItem.trim()]);setNewItem("");}}>+ Добавить</Btn>
      </div>
      <div style={{marginTop:16}}><Btn onClick={()=>{onSaveLists?.(editOpen,editClose);setEditing(false);}}>Сохранить</Btn></div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>Чек-листы</div>
        {canEdit&&<button onClick={()=>setEditing(true)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:F,display:"flex",alignItems:"center",gap:6}}><Icon name="edit" size={14} color={C.secondary}/>Редактировать</button>}
      </div>
      <div style={{display:"flex",background:C.surface,borderRadius:12,padding:3,marginBottom:20}}>
        {(["open","close"] as const).map(k=>(
          <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"9px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:F,background:tab===k?C.bg:"transparent",color:tab===k?C.primary:C.subtle,fontSize:14,fontWeight:tab===k?700:400}}>{k==="open"?"Открытие":"Закрытие"}</button>
        ))}
      </div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <div style={{fontSize:14,fontWeight:600}}>{done} из {list.length}</div>
          <div style={{fontSize:14,fontWeight:800,color:pct===100?C.green:C.primary}}>{pct}%</div>
        </div>
        <div style={{height:5,background:C.surface,borderRadius:3,overflow:"hidden",marginBottom:16}}>
          <div style={{height:"100%",width:`${pct}%`,background:pct===100?C.green:C.primary,borderRadius:3,transition:"width 0.3s"}}/>
        </div>
        {list.map((item,i)=>{
          const isDone=checked[tab].includes(i);
          return(
            <div key={i} onClick={()=>setChecked(p=>({...p,[tab]:isDone?p[tab].filter(x=>x!==i):[...p[tab],i]}))} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<list.length-1?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
              <div style={{width:24,height:24,borderRadius:7,flexShrink:0,border:`2px solid ${isDone?C.primary:C.border}`,background:isDone?C.primary:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s"}}>
                {isDone&&<Icon name="check" size={13} color="#FFF" sw={2.5}/>}
              </div>
              <span style={{fontSize:15,color:isDone?C.subtle:C.primary,textDecoration:isDone?"line-through":"none"}}>{item}</span>
            </div>
          );
        })}
        {pct===100&&<div style={{fontSize:13,color:C.green,marginTop:12,fontWeight:700,textAlign:"center"}}>✓ Всё готово!</div>}
      </Card>
    </div>
  );
}

// ══ VISIT FORM ════════════════════════════════════════════════════
function VisitForm({onBack,allVisits,isMaster=false}:{onBack:()=>void;allVisits?:typeof VISITS_DATA;isMaster?:boolean}){
  const r={last:useRef<HTMLInputElement>(null),first:useRef<HTMLInputElement>(null),service:useRef<HTMLInputElement>(null),materials:useRef<HTMLInputElement>(null),price:useRef<HTMLInputElement>(null),discount:useRef<HTMLInputElement>(null)};
  const [form,setForm]=useState({lastName:"",firstName:"",service:"",materials:"",price:"",discountPct:"0"});
  const [photoBefore,setPhotoBefore]=useState(false);
  const [photoAfter,setPhotoAfter]=useState(false);
  const [saved,setSaved]=useState(false);
  const [suggestion,setSuggestion]=useState<typeof VISITS_DATA[0]|null>(null);
  const now=new Date();
  const [date,setDate]=useState(now.toISOString().slice(0,10));
  const [time,setTime]=useState(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`);

  const priceNum=parseInt(form.price)||0;
  const discPct=parseInt(form.discountPct)||0;
  const discRub=Math.round(priceNum*discPct/100);
  const finalPrice=priceNum-discRub;
  const masterEarned=Math.round(priceNum*0.4);

  const handleLastName=(v:string)=>{
    setForm(p=>({...p,lastName:v}));
    if(allVisits&&v.length>=2){
      const found=allVisits.find(x=>x.lastName.toLowerCase().startsWith(v.toLowerCase()));
      // ВАЖНО: телефон мастеру не показываем — только имя и дата
      setSuggestion(found||null);
    }else setSuggestion(null);
  };

  if(saved) return(
    <div style={{textAlign:"center",padding:"60px 20px"}}>
      <div style={{fontSize:48,marginBottom:16}}>✅</div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:8}}>Визит сохранён</div>
      <div style={{fontSize:14,color:C.subtle,marginBottom:32}}>Данные добавлены в историю</div>
      <Btn onClick={onBack}>Готово</Btn>
    </div>
  );

  return(
    <div>
      <BackBtn onClick={onBack}/>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Новый визит</div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Фамилия</div>
          <input ref={r.last} placeholder="Иванова" value={form.lastName} onChange={(e:any)=>handleLastName(e.target.value)} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();r.first.current?.focus();}}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Имя</div>
          <input ref={r.first} placeholder="Анна" value={form.firstName} onChange={(e:any)=>setForm(p=>({...p,firstName:e.target.value}))} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();r.service.current?.focus();}}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
      </div>

      {suggestion&&(
        <div style={{background:C.orangeBg,border:`1px solid ${C.orange}33`,borderRadius:10,padding:"10px 14px",marginBottom:14}}>
          <div style={{fontSize:12,color:C.orange,fontWeight:700,marginBottom:4}}>⚡ Найден клиент</div>
          {/* Телефон мастеру не показываем */}
          <div style={{fontSize:13,color:C.secondary}}>{suggestion.lastName} {suggestion.firstName} · последний визит {suggestion.date}</div>
          <div style={{fontSize:12,color:C.subtle,marginTop:2}}>{suggestion.service}</div>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn small onClick={()=>{setForm(p=>({...p,firstName:suggestion.firstName}));setSuggestion(null);}}>Это он/она</Btn>
            <Btn small variant="secondary" onClick={()=>setSuggestion(null)}>Другой человек</Btn>
          </div>
        </div>
      )}

      {[{label:"Услуга",key:"service",ref:r.service,next:r.materials,placeholder:"Маникюр + гель-лак"},{label:"Материалы",key:"materials",ref:r.materials,next:r.price,placeholder:"Гель-лак №47, топ..."}].map(f=>(
        <div key={f.key} style={{marginBottom:14}}>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>{f.label}</div>
          <input ref={f.ref} placeholder={f.placeholder} value={(form as any)[f.key]} onChange={(e:any)=>setForm(p=>({...p,[f.key]:e.target.value}))} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();f.next.current?.focus();}}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
      ))}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Сумма, ₽</div>
          <input ref={r.price} type="number" placeholder="2500" value={form.price} onChange={(e:any)=>setForm(p=>({...p,price:e.target.value}))} onKeyDown={(e:any)=>{if(e.key==="Enter"){e.preventDefault();r.discount.current?.focus();}}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Скидка, %</div>
          <input ref={r.discount} type="number" placeholder="0" value={form.discountPct} onChange={(e:any)=>setForm(p=>({...p,discountPct:e.target.value}))} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
      </div>

      {priceNum>0&&(
        <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:12}}>
          {discPct>0&&<div style={{color:C.orange,marginBottom:4}}>Скидка {discPct}% = {discRub.toLocaleString()} ₽ · Клиент платит: {finalPrice.toLocaleString()} ₽</div>}
          <div style={{color:C.green,fontWeight:600}}>Заработок мастера (40% от {priceNum.toLocaleString()} ₽): {masterEarned.toLocaleString()} ₽</div>
        </div>
      )}

      <div style={{marginBottom:16}}>
        <div style={{fontSize:13,color:C.secondary,marginBottom:8,fontWeight:500}}>Фото</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[["до",photoBefore,setPhotoBefore],["после",photoAfter,setPhotoAfter]].map(([l,v,s]:any,i)=>(
            <div key={i} onClick={()=>s(!v)} style={{border:`1.5px ${v?"solid":"dashed"} ${v?C.green:C.border}`,borderRadius:12,padding:20,textAlign:"center",cursor:"pointer",background:v?C.greenBg:C.surface}}>
              {v?<div style={{fontSize:24}}>📷</div>:<Icon name="camera" size={22} color={C.subtle}/>}
              <div style={{fontSize:12,color:v?C.green:C.subtle,marginTop:8,fontWeight:v?600:400}}>Фото {l}{v?" ✓":""}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Дата</div>
          <input type="date" value={date} onChange={(e:any)=>setDate(e.target.value)} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
        <div>
          <div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Время</div>
          <input type="time" value={time} onChange={(e:any)=>setTime(e.target.value)} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.primary,outline:"none",fontFamily:F}}/>
        </div>
      </div>
      <Btn onClick={()=>setSaved(true)}>Сохранить визит</Btn>
    </div>
  );
}

// ══ MASTER VIEWS ══════════════════════════════════════════════════
function MasterOnboarding({onDone}:{onDone:(n:{first:string;last:string})=>void}){
  const [last,setLast]=useState("");
  const [first,setFirst]=useState("");
  const firstRef=useRef<HTMLInputElement>(null);
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",fontFamily:F,background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:32,fontWeight:800,color:C.primary,letterSpacing:"-1px"}}>Studio OS</div>
        <div style={{fontSize:14,color:C.subtle,marginTop:6}}>Добро пожаловать!</div>
      </div>
      <div style={{width:"100%",maxWidth:390}}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Как вас зовут?</div>
        <div style={{fontSize:13,color:C.subtle,marginBottom:24}}>Владелец студии увидит ваше имя</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
          <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Фамилия</div><input autoFocus value={last} onChange={e=>setLast(e.target.value)} onKeyDown={(e:any)=>{if(e.key==="Enter")firstRef.current?.focus();}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder="Смирнова"/></div>
          <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Имя</div><input ref={firstRef} value={first} onChange={e=>setFirst(e.target.value)} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder="Мария"/></div>
        </div>
        <Btn onClick={()=>{if(last.trim()&&first.trim())onDone({first,last});}}>Продолжить</Btn>
      </div>
    </div>
  );
}

function MasterHome({masterName,setView}:{masterName:string;setView:(v:string)=>void}){
  const myVisits=VISITS_DATA.filter(v=>v.master.includes(masterName.split(" ")[0]));
  const todayVisits=myVisits.filter(v=>v.date==="2026-07-14");
  const myEarned=Math.round(myVisits.reduce((s,v)=>s+v.price,0)*0.4);
  return(
    <div>
      <div style={{marginBottom:20}}><div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>Привет, {masterName.split(" ")[0]} 👋</div><div style={{fontSize:13,color:C.subtle,marginTop:4}}>14 июля 2026</div></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div style={{background:C.primary,borderRadius:14,padding:16}}><div style={{fontSize:22,fontWeight:800,color:"#FFF",letterSpacing:"-0.5px"}}>{myEarned.toLocaleString()} ₽</div><div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:4}}>Мои финансы</div></div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}><div style={{fontSize:22,fontWeight:800}}>{todayVisits.length}</div><div style={{fontSize:12,color:C.subtle,marginTop:4}}>Визитов сегодня</div></div>
      </div>
      {todayVisits.length>0&&(
        <Card>
          <ST>Сегодня</ST>
          {todayVisits.map((v,i)=>(
            <div key={v.id} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:i<todayVisits.length-1?`1px solid ${C.border}`:"none"}}>
              <div><div style={{fontSize:14,fontWeight:500}}>{v.lastName} {v.firstName}</div><div style={{fontSize:12,color:C.subtle}}>{v.service} · {v.time}</div></div>
              <div style={{fontSize:14,fontWeight:700}}>{v.price.toLocaleString()} ₽</div>
            </div>
          ))}
        </Card>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {[{label:"Клиенты",icon:"clients",view:"m_clients"},{label:"Смена",icon:"shift",view:"shift"},{label:"Склад",icon:"supply",view:"supplies"},{label:"Финансы",icon:"finance",view:"m_finance"}].map((a,i)=>(
          <button key={i} onClick={()=>setView(a.view)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",cursor:"pointer",textAlign:"center",fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
            <Icon name={a.icon} size={20} color={C.primary}/><span style={{fontSize:12,color:C.secondary,fontWeight:500}}>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MasterClients({masterName,setView}:{masterName:string;setView:(v:string)=>void}){
  const myVisits=VISITS_DATA.filter(v=>v.master.includes(masterName.split(" ")[0]));
  const clientMap=new Map<string,typeof VISITS_DATA>();
  myVisits.forEach(v=>{const key=`${v.lastName}_${v.firstName}`;if(!clientMap.has(key))clientMap.set(key,[]);clientMap.get(key)!.push(v);});
  const clients=Array.from(clientMap.entries()).map(([key,visits])=>({key,lastName:visits[0].lastName,firstName:visits[0].firstName,visits}));
  const [sel,setSel]=useState<typeof clients[0]|null>(null);

  if(sel) return(
    <div>
      <BackBtn onClick={()=>setSel(null)} label="Клиенты"/>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:C.secondary}}>{sel.lastName[0]}</div>
        <div>
          <div style={{fontSize:18,fontWeight:800}}>{sel.lastName} {sel.firstName}</div>
          {/* Телефон мастеру не показываем */}
          <div style={{fontSize:12,color:C.subtle,marginTop:2}}>Визитов: {sel.visits.length}</div>
        </div>
      </div>
      <Card>
        <ST>История визитов</ST>
        {sel.visits.map((v,i)=>(
          <div key={v.id} style={{padding:"10px 0",borderBottom:i<sel.visits.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><div style={{fontSize:14,fontWeight:500}}>{v.service}</div><div style={{fontSize:14,fontWeight:700}}>{v.price.toLocaleString()} ₽</div></div>
            <div style={{fontSize:12,color:C.subtle}}>{v.date} · {v.time} · {v.materials}</div>
            {(v.photoBefore||v.photoAfter)&&<div style={{fontSize:12,color:C.green,marginTop:4}}>{v.photoBefore?"📷 до ":""}{v.photoAfter?"📷 после":""}</div>}
          </div>
        ))}
      </Card>
      <Btn onClick={()=>setView("m_visit_new")}>+ Новый визит этому клиенту</Btn>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>Мои клиенты</div>
        <button onClick={()=>setView("m_visit_new")} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Визит</button>
      </div>
      <Card style={{padding:0}}>
        {clients.length===0?<div style={{padding:20,textAlign:"center",color:C.subtle,fontSize:14}}>Пока нет клиентов</div>:clients.map((c,i)=>(
          <div key={c.key} onClick={()=>setSel(c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:i<clients.length-1?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:C.secondary}}>{c.lastName[0]}</div>
              <div><div style={{fontSize:14,fontWeight:500}}>{c.lastName} {c.firstName}</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>Визитов: {c.visits.length} · {c.visits[c.visits.length-1].date}</div></div>
            </div>
            <span style={{fontSize:20,color:C.border}}>›</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

function MasterFinance({masterName}:{masterName:string}){
  const [period,setPeriod]=useState("today");
  const myVisits=VISITS_DATA.filter(v=>v.master.includes(masterName.split(" ")[0]));
  const filtered=period==="today"?myVisits.filter(v=>v.date==="2026-07-14"):period==="week"?myVisits.filter(v=>v.date>="2026-07-08"):myVisits;
  const revenue=filtered.reduce((s,v)=>s+v.price,0);
  const earned=Math.round(revenue*0.4);
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:16}}>Мои финансы</div>
      <PeriodFilter value={period} onChange={setPeriod}/>
      <div style={{background:C.primary,borderRadius:16,padding:20,marginBottom:12,color:"#FFF"}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:6}}>Мой заработок</div>
        <div style={{fontSize:44,fontWeight:800,letterSpacing:"-1.5px"}}>{earned.toLocaleString()} ₽</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:8}}>{filtered.length} визитов · 40% от суммы</div>
      </div>
      <Card>
        {[["Выручка с клиентов",`${revenue.toLocaleString()} ₽`],["Процент","40%"],["Мой заработок",`${earned.toLocaleString()} ₽`]].map(([k,v],i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`}}>
            <span style={{fontSize:13,color:C.subtle}}>{k}</span><span style={{fontSize:14,fontWeight:600}}>{v}</span>
          </div>
        ))}
      </Card>
      <Card>
        <ST>История визитов</ST>
        {filtered.length===0?<div style={{color:C.subtle,fontSize:14,textAlign:"center",padding:"10px 0"}}>Нет визитов за период</div>:filtered.map((v,i)=>(
          <div key={v.id} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:i<filtered.length-1?`1px solid ${C.border}`:"none"}}>
            <div><div style={{fontSize:13,fontWeight:500}}>{v.lastName} {v.firstName}</div><div style={{fontSize:12,color:C.subtle}}>{v.date} · {v.time}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700}}>{Math.round(v.price*0.4).toLocaleString()} ₽</div><div style={{fontSize:11,color:C.subtle}}>{v.price.toLocaleString()} ₽ чек</div></div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function MasterMore({setView}:{setView:(v:string)=>void}){
  const [feedback,setFeedback]=useState("");
  const [sent,setSent]=useState(false);
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Ещё</div>
      <Card style={{cursor:"pointer"}} onClick={()=>setView("knowledge")}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:40,height:40,borderRadius:12,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="book" size={20} color={C.primary}/></div>
          <div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>База знаний</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>Стандарты, правила, инструкции</div></div>
          <span style={{fontSize:20,color:C.border}}>›</span>
        </div>
      </Card>
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
          <div style={{width:40,height:40,borderRadius:12,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center"}}><Icon name="msg" size={20} color={C.primary}/></div>
          <div><div style={{fontSize:15,fontWeight:600}}>Обратная связь</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>Передаётся владельцу студии</div></div>
        </div>
        {!sent?(
          <>
            <textarea style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:14,color:C.primary,outline:"none",fontFamily:F,minHeight:100,resize:"vertical" as const,marginBottom:12}} placeholder="Напишите предложение или вопрос..." value={feedback} onChange={(e:any)=>setFeedback(e.target.value)}/>
            <Btn onClick={()=>{if(feedback.trim())setSent(true);}}>Отправить</Btn>
          </>
        ):(
          <div style={{background:C.greenBg,borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:14,fontWeight:600,color:C.green}}>✓ Отправлено владельцу</div></div>
        )}
      </Card>
    </div>
  );
}

// ══ OWNER ONBOARDING ══════════════════════════════════════════════
function OwnerOnboarding({onDone}:{onDone:(d:{first:string;last:string;studio:string})=>void}){
  const [step,setStep]=useState(1);
  const [data,setData]=useState({first:"",last:"",studio:""});
  const firstRef=useRef<HTMLInputElement>(null);
  const studioRef=useRef<HTMLInputElement>(null);

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",fontFamily:F,background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:32,fontWeight:800,color:C.primary,letterSpacing:"-1px"}}>Studio OS</div>
        <div style={{fontSize:14,color:C.subtle,marginTop:6}}>Добро пожаловать!</div>
      </div>
      <div style={{width:"100%",maxWidth:390}}>
        {step===1?(
          <>
            <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Как вас зовут?</div>
            <div style={{fontSize:13,color:C.subtle,marginBottom:24}}>Шаг 1 из 2</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Фамилия</div><input autoFocus value={data.last} onChange={e=>setData(p=>({...p,last:e.target.value}))} onKeyDown={(e:any)=>{if(e.key==="Enter")firstRef.current?.focus();}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder="Паутов"/></div>
              <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Имя</div><input ref={firstRef} value={data.first} onChange={e=>setData(p=>({...p,first:e.target.value}))} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder="Артём"/></div>
            </div>
            <Btn onClick={()=>{if(data.last.trim()&&data.first.trim())setStep(2);}}>Далее</Btn>
          </>
        ):(
          <>
            <div style={{fontSize:18,fontWeight:700,marginBottom:6}}>Название студии</div>
            <div style={{fontSize:13,color:C.subtle,marginBottom:24}}>Шаг 2 из 2 · Будет отображаться в вашем кабинете</div>
            <div style={{marginBottom:20}}>
              <input ref={studioRef} autoFocus value={data.studio} onChange={e=>setData(p=>({...p,studio:e.target.value}))} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"13px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} placeholder="Студия на Тверской"/>
            </div>
            <Btn onClick={()=>{if(data.studio.trim())onDone(data);}}>Начать работу</Btn>
          </>
        )}
      </div>
    </div>
  );
}

// ══ OWNER VIEWS ═══════════════════════════════════════════════════
function OwnerHome({studioName,setView}:{studioName:string;setView:(v:string)=>void}){
  const stVisits=VISITS_DATA.filter(v=>v.studio===1&&v.date==="2026-07-14");
  const revenue=stVisits.reduce((s,v)=>s+v.price,0);
  const secPct=61;
  return(
    <div>
      <div style={{marginBottom:20}}><div style={{fontSize:22,fontWeight:800,letterSpacing:"-0.5px"}}>Доброе утро 👋</div><div style={{fontSize:13,color:C.subtle,marginTop:4}}>{studioName} · 14 июля 2026</div></div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div style={{background:C.primary,borderRadius:14,padding:16}}><div style={{fontSize:22,fontWeight:800,color:"#FFF",letterSpacing:"-0.5px"}}>{revenue.toLocaleString()} ₽</div><div style={{fontSize:12,color:"rgba(255,255,255,0.55)",marginTop:4}}>Выручка сегодня</div></div>
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16}}><div style={{fontSize:22,fontWeight:800}}>{stVisits.length}</div><div style={{fontSize:12,color:C.subtle,marginTop:4}}>Визитов сегодня</div></div>
      </div>
      <Card style={{borderLeft:`3px solid ${C.orange}`,cursor:"pointer"}} onClick={()=>setView("security")}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name="shield" size={16} color={C.orange}/><span style={{fontSize:13,fontWeight:700}}>Безопасность</span></div>
          <Badge color={C.orange} bg={C.orangeBg}>{secPct}%</Badge>
        </div>
        <div style={{height:4,background:C.surface,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${secPct}%`,background:C.orange,borderRadius:2}}/></div>
        <div style={{fontSize:12,color:C.subtle,marginTop:8}}>3 нарушения не устранено · Открыть →</div>
      </Card>
      <Card>
        <ST>Визиты сегодня</ST>
        {stVisits.map((v,i)=>(
          <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<stVisits.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:C.secondary}}>{v.lastName[0]}</div>
              <div><div style={{fontSize:14,fontWeight:500}}>{v.lastName} {v.firstName}</div><div style={{fontSize:12,color:C.subtle}}>{v.service} · {v.master.split(" ")[0]} · {v.time}</div></div>
            </div>
            <div style={{fontSize:14,fontWeight:700}}>{v.price.toLocaleString()} ₽</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OwnerClients(){
  const [clients,setClients]=useState(()=>{
    const map=new Map<string,any>();
    VISITS_DATA.filter(v=>v.studio===1).forEach(v=>{
      const key=`${v.lastName}_${v.firstName}`;
      if(!map.has(key))map.set(key,{key,lastName:v.lastName,firstName:v.firstName,phone:v.phone,visits:[],allergies:"",notes:""});
      map.get(key).visits.push(v);
    });
    return Array.from(map.values());
  });
  const [sel,setSel]=useState<any>(null);
  const [showAdd,setShowAdd]=useState(false);
  const [search,setSearch]=useState("");
  const [form,setForm]=useState({lastName:"",firstName:"",phone:"",allergies:"",notes:""});
  const firstRef=useRef<HTMLInputElement>(null);
  const phoneRef=useRef<HTMLInputElement>(null);

  if(showAdd) return(
    <div>
      <BackBtn onClick={()=>setShowAdd(false)}/>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Новый клиент</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Фамилия</div><input autoFocus onKeyDown={(e:any)=>{if(e.key==="Enter")firstRef.current?.focus();}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} value={form.lastName} onChange={(e:any)=>setForm(p=>({...p,lastName:e.target.value}))} placeholder="Иванова"/></div>
        <div><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>Имя</div><input ref={firstRef} onKeyDown={(e:any)=>{if(e.key==="Enter")phoneRef.current?.focus();}} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} value={form.firstName} onChange={(e:any)=>setForm(p=>({...p,firstName:e.target.value}))} placeholder="Анна"/></div>
      </div>
      {[{l:"Телефон",k:"phone",r:phoneRef,p:"+7 900 000-00-00"},{l:"Аллергии",k:"allergies",r:null,p:"Гель-лак Kodi..."},{l:"Заметки",k:"notes",r:null,p:"Предпочтения клиента..."}].map(f=>(
        <div key={f.k} style={{marginBottom:14}}><div style={{fontSize:13,color:C.secondary,marginBottom:6,fontWeight:500}}>{f.l}</div><input ref={f.r} style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F}} value={(form as any)[f.k]} onChange={(e:any)=>setForm(p=>({...p,[f.k]:e.target.value}))} placeholder={f.p}/></div>
      ))}
      <Btn onClick={()=>{if(!form.lastName.trim())return;setClients(p=>[...p,{key:`${form.lastName}_${form.firstName}`,...form,visits:[]}]);setShowAdd(false);setForm({lastName:"",firstName:"",phone:"",allergies:"",notes:""});}}>Сохранить клиента</Btn>
    </div>
  );

  if(sel) return(
    <div>
      <BackBtn onClick={()=>setSel(null)}/>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:20}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:700,color:C.secondary}}>{sel.lastName[0]}</div>
        <div><div style={{fontSize:18,fontWeight:800}}>{sel.lastName} {sel.firstName}</div><div style={{fontSize:13,color:C.subtle}}>{sel.phone}</div></div>
      </div>
      {sel.allergies&&<Card style={{background:C.redBg,borderColor:C.red+"33"}}><div style={{fontSize:12,color:C.red,fontWeight:700,marginBottom:4}}>⚠️ Аллергии</div><div style={{fontSize:13,color:C.secondary}}>{sel.allergies}</div></Card>}
      <Card>
        <ST>История визитов с фото</ST>
        {sel.visits.length===0?<div style={{color:C.subtle,fontSize:14}}>Нет визитов</div>:sel.visits.map((v:any,i:number)=>(
          <div key={v.id} style={{padding:"12px 0",borderBottom:i<sel.visits.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <div style={{fontSize:14,fontWeight:500}}>{v.service}</div>
              <div style={{fontSize:14,fontWeight:700}}>{v.price.toLocaleString()} ₽</div>
            </div>
            <div style={{fontSize:12,color:C.subtle,marginBottom:6}}>{v.date} · {v.time} · {v.master.split(" ")[0]}</div>
            {(v.photoBefore||v.photoAfter)&&(
              <div style={{display:"flex",gap:8}}>
                {v.photoBefore&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.secondary,display:"flex",alignItems:"center",gap:6}}><span>📷</span>Фото до</div>}
                {v.photoAfter&&<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.secondary,display:"flex",alignItems:"center",gap:6}}><span>📷</span>Фото после</div>}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );

  const filtered=clients.filter(c=>`${c.lastName} ${c.firstName}`.toLowerCase().includes(search.toLowerCase()));
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:20,fontWeight:800}}>Клиенты</div>
        <button onClick={()=>setShowAdd(true)} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Клиент</button>
      </div>
      <input style={{width:"100%",boxSizing:"border-box" as const,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px",fontSize:15,color:C.primary,outline:"none",fontFamily:F,marginBottom:12}} placeholder="Поиск по имени..." value={search} onChange={e=>setSearch(e.target.value)}/>
      <Card style={{padding:0}}>
        {filtered.map((c,i)=>(
          <div key={c.key} onClick={()=>setSel(c)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:i<filtered.length-1?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:38,height:38,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:C.secondary}}>{c.lastName[0]}</div>
              <div><div style={{fontSize:14,fontWeight:500}}>{c.lastName} {c.firstName}</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>{c.phone} · {c.visits.length} визитов</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {c.visits.some((v:any)=>v.photoBefore||v.photoAfter)&&<Icon name="camera" size={14} color={C.subtle}/>}
              <span style={{fontSize:20,color:C.border}}>›</span>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OwnerVisits(){
  const [sub,setSub]=useState<string|null>(null);
  const stVisits=VISITS_DATA.filter(v=>v.studio===1);
  if(sub==="new") return <VisitForm onBack={()=>setSub(null)} allVisits={stVisits}/>;
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>Визиты</div>
        <button onClick={()=>setSub("new")} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Визит</button>
      </div>
      <Card style={{padding:0}}>
        {stVisits.map((v,i)=>(
          <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 16px",borderBottom:i<stVisits.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:C.secondary}}>{v.lastName[0]}</div>
              <div><div style={{fontSize:14,fontWeight:500}}>{v.lastName} {v.firstName}</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>{v.service} · {v.master.split(" ")[0]} · {v.date} {v.time}</div></div>
            </div>
            <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:700}}>{v.price.toLocaleString()} ₽</div>{v.discountPct>0&&<div style={{fontSize:11,color:C.orange}}>−{v.discountPct}%</div>}</div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OwnerFinance(){
  const [period,setPeriod]=useState("today");
  const stVisits=VISITS_DATA.filter(v=>v.studio===1);
  const filtered=period==="today"?stVisits.filter(v=>v.date==="2026-07-14"):period==="week"?stVisits.filter(v=>v.date>="2026-07-08"):stVisits;
  const revenue=filtered.reduce((s,v)=>s+v.price,0);

  const masterSalaries=MASTERS_DATA.map(m=>{
    const mv=filtered.filter(v=>v.master===m.name);
    return{...m,visits:mv.length,earned:mv.reduce((s,v)=>s+Math.round(v.price*m.pct/100),0),revenue:mv.reduce((s,v)=>s+v.price,0)};
  });
  const totalSalary=masterSalaries.reduce((s,m)=>s+m.earned,0);

  // Постоянные расходы (фикс ₽)
  const [fixedExp,setFixedExp]=useState([
    {id:1,name:"Аренда помещения",amount:85000},{id:2,name:"DIKIDI",amount:2490},{id:3,name:"Studio OS",amount:1490},
  ]);
  // Процентные расходы (% от выручки)
  const [pctExp,setPctExp]=useState([
    {id:1,name:"Налог УСН",pct:6},{id:2,name:"Эквайринг",pct:1.5},
  ]);
  // Переменные расходы (фикс ₽)
  const [varExp,setVarExp]=useState([
    {id:1,name:"Расходники",amount:12000},{id:2,name:"Кофе и кухня",amount:3500},
  ]);

  const [addMode,setAddMode]=useState<null|"fixed"|"pct"|"var">(null);
  const [newE,setNewE]=useState({name:"",amount:"",pct:""});

  const totalFixed=fixedExp.reduce((s,e)=>s+e.amount,0);
  const totalPct=pctExp.reduce((s,e)=>s+Math.round(revenue*e.pct/100),0);
  const totalVar=varExp.reduce((s,e)=>s+e.amount,0);
  const profit=revenue-totalSalary-totalFixed-totalPct-totalVar;

  const addForm=(type:"fixed"|"pct"|"var")=>(
    <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:12}}>
      <input style={{width:"100%",boxSizing:"border-box" as const,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",fontSize:14,color:C.primary,outline:"none",fontFamily:F,marginBottom:8}} placeholder="Название" value={newE.name} onChange={(e:any)=>setNewE(p=>({...p,name:e.target.value}))}/>
      <div style={{display:"flex",gap:8}}>
        <input type="number" style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",fontSize:14,color:C.primary,outline:"none",fontFamily:F}} placeholder={type==="pct"?"% от выручки":"Сумма ₽"} value={type==="pct"?newE.pct:newE.amount} onChange={(e:any)=>setNewE(p=>({...p,[type==="pct"?"pct":"amount"]:e.target.value}))}/>
        <Btn small onClick={()=>{
          if(!newE.name)return;
          if(type==="fixed")setFixedExp(p=>[...p,{id:Date.now(),name:newE.name,amount:parseInt(newE.amount)||0}]);
          if(type==="pct")setPctExp(p=>[...p,{id:Date.now(),name:newE.name,pct:parseFloat(newE.pct)||0}]);
          if(type==="var")setVarExp(p=>[...p,{id:Date.now(),name:newE.name,amount:parseInt(newE.amount)||0}]);
          setNewE({name:"",amount:"",pct:""});setAddMode(null);
        }}>Добавить</Btn>
      </div>
    </div>
  );

  const expRow=(label:string,value:string,onDel?:()=>void)=>(
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:`1px solid ${C.border}`}}>
      <span style={{fontSize:14}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:14,fontWeight:700}}>{value}</span>
        {onDel&&<button onClick={onDel} style={{background:"none",border:"none",cursor:"pointer",padding:2}}><Icon name="trash" size={14} color={C.red}/></button>}
      </div>
    </div>
  );

  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:16}}>Финансы</div>
      <PeriodFilter value={period} onChange={setPeriod}/>

      {/* Итог */}
      <div style={{background:C.primary,borderRadius:16,padding:20,marginBottom:12,color:"#FFF"}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:6}}>Чистая прибыль</div>
        <div style={{fontSize:40,fontWeight:800,letterSpacing:"-1.5px",color:profit>=0?"#FFF":C.red}}>{profit.toLocaleString()} ₽</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginTop:16}}>
          {[["Выручка",revenue],["Зарплаты",totalSalary],["Пост. расходы",totalFixed],["% расходы",totalPct],["Перем. расходы",totalVar]].map(([l,v],i)=>(
            <div key={i}><div style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>{(v as number).toLocaleString()} ₽</div><div style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>{l}</div></div>
          ))}
        </div>
      </div>

      {/* Зарплаты мастеров */}
      <Card>
        <ST>Зарплаты мастеров</ST>
        {masterSalaries.map((m,i)=>(
          <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<masterSalaries.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:34,height:34,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:C.secondary}}>{m.name[0]}</div>
              <div><div style={{fontSize:14,fontWeight:500}}>{m.name}</div><div style={{fontSize:12,color:C.subtle}}>{m.visits} виз. · {m.pct}% · выручка {m.revenue.toLocaleString()} ₽</div></div>
            </div>
            <div style={{fontSize:15,fontWeight:800}}>{m.earned.toLocaleString()} ₽</div>
          </div>
        ))}
      </Card>

      {/* Постоянные расходы */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <ST>Постоянные расходы (₽)</ST>
          <button onClick={()=>setAddMode(addMode==="fixed"?null:"fixed")} style={{background:"none",border:"none",cursor:"pointer"}}><Icon name="plus" size={18} color={C.primary}/></button>
        </div>
        {addMode==="fixed"&&addForm("fixed")}
        {fixedExp.map(e=>expRow(e.name,`${e.amount.toLocaleString()} ₽`,()=>setFixedExp(p=>p.filter(x=>x.id!==e.id))))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",marginTop:4,borderTop:`2px solid ${C.border}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.subtle}}>Итого</span><span style={{fontSize:14,fontWeight:800}}>{totalFixed.toLocaleString()} ₽</span>
        </div>
      </Card>

      {/* Процентные расходы */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <ST>Расходы в % от выручки</ST>
          <button onClick={()=>setAddMode(addMode==="pct"?null:"pct")} style={{background:"none",border:"none",cursor:"pointer"}}><Icon name="plus" size={18} color={C.primary}/></button>
        </div>
        <div style={{fontSize:12,color:C.subtle,marginBottom:10}}>Считается от выручки {revenue.toLocaleString()} ₽</div>
        {addMode==="pct"&&addForm("pct")}
        {pctExp.map(e=>expRow(`${e.name} (${e.pct}%)`,`${Math.round(revenue*e.pct/100).toLocaleString()} ₽`,()=>setPctExp(p=>p.filter(x=>x.id!==e.id))))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",marginTop:4,borderTop:`2px solid ${C.border}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.subtle}}>Итого</span><span style={{fontSize:14,fontWeight:800}}>{totalPct.toLocaleString()} ₽</span>
        </div>
      </Card>

      {/* Переменные расходы */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <ST>Переменные расходы</ST>
          <button onClick={()=>setAddMode(addMode==="var"?null:"var")} style={{background:"none",border:"none",cursor:"pointer"}}><Icon name="plus" size={18} color={C.primary}/></button>
        </div>
        {addMode==="var"&&addForm("var")}
        {varExp.map(e=>expRow(e.name,`${e.amount.toLocaleString()} ₽`,()=>setVarExp(p=>p.filter(x=>x.id!==e.id))))}
        <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",marginTop:4,borderTop:`2px solid ${C.border}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.subtle}}>Итого</span><span style={{fontSize:14,fontWeight:800}}>{totalVar.toLocaleString()} ₽</span>
        </div>
      </Card>
    </div>
  );
}

function OwnerSecurity(){
  const [violations,setViolations]=useState(VIOLATIONS_DATA);
  const [uploaded,setUploaded]=useState(false);
  const [activeDocCat,setActiveDocCat]=useState<string|null>(null);
  const done=violations.filter(v=>v.done).length;
  const pct=61;
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Безопасность</div>
      <div style={{background:C.primary,borderRadius:16,padding:20,marginBottom:12,color:"#FFF"}}>
        <div style={{fontSize:12,color:"rgba(255,255,255,0.5)",textTransform:"uppercase" as const,letterSpacing:"0.5px",marginBottom:6}}>Индекс безопасности</div>
        <div style={{fontSize:48,fontWeight:800,letterSpacing:"-2px",marginBottom:4}}>{pct}%</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:14}}>Жёлтая зона · Есть нарушения</div>
        <div style={{height:4,background:"rgba(255,255,255,0.2)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:"#FFF",borderRadius:2}}/></div>
        <div style={{display:"flex",gap:24,marginTop:14}}>
          {[{v:violations.length,l:"Нарушений"},{v:done,l:"Устранено"},{v:violations.length-done,l:"Осталось"}].map((s,i)=>(
            <div key={i}><div style={{fontSize:20,fontWeight:800}}>{s.v}</div><div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{s.l}</div></div>
          ))}
        </div>
      </div>
      <Card>
        <ST>Отчёт аудита</ST>
        {!uploaded?(
          <div onClick={()=>setUploaded(true)} style={{border:`1.5px dashed ${C.border}`,borderRadius:12,padding:24,textAlign:"center",cursor:"pointer",background:C.surface}}>
            <Icon name="upload" size={26} color={C.subtle}/>
            <div style={{fontSize:14,color:C.secondary,marginTop:10,fontWeight:600}}>Загрузить PDF-отчёт</div>
            <div style={{fontSize:12,color:C.subtle,marginTop:4}}>Получите отчёт от специалиста «Безопасного бизнеса»</div>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",gap:12,background:C.greenBg,borderRadius:10,padding:14}}>
            <Icon name="shield" size={20} color={C.green}/>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700}}>AUD-2026-0714-0001</div><div style={{fontSize:12,color:C.subtle}}>Загружен · 14 июля 2026</div></div>
            <button onClick={()=>setUploaded(false)} style={{background:"none",border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 10px",fontSize:12,color:C.secondary,cursor:"pointer",fontFamily:F}}>Обновить</button>
          </div>
        )}
      </Card>
      <Card>
        <ST>Документы студии</ST>
        <div style={{fontSize:12,color:C.subtle,marginBottom:12}}>Прикрепите документы по каждому разделу</div>
        {DOC_SECTIONS.map((section,si)=>(
          <div key={si}>
            <div onClick={()=>setActiveDocCat(activeDocCat===section.cat?null:section.cat)} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderTop:si>0?`1px solid ${C.border}`:"none",cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><Icon name="doc" size={15} color={C.secondary}/><span style={{fontSize:14,fontWeight:500}}>{section.cat}</span></div>
              <span style={{fontSize:16,color:C.border,transition:"transform 0.2s",transform:activeDocCat===section.cat?"rotate(90deg)":"none"}}>›</span>
            </div>
            {activeDocCat===section.cat&&(
              <div style={{background:C.surface,borderRadius:10,padding:12,marginBottom:8}}>
                {section.items.map((item,ii)=>(
                  <div key={ii} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:ii<section.items.length-1?`1px solid ${C.border}`:"none"}}>
                    <span style={{fontSize:13,color:C.secondary}}>{item}</span>
                    <button style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",fontSize:11,color:C.secondary,cursor:"pointer",fontFamily:F}}>+ Прикрепить</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>
      <Card style={{padding:0}}>
        <div style={{padding:"14px 16px",borderBottom:`1px solid ${C.border}`}}><ST>Карта нарушений</ST></div>
        {violations.map((v,i)=>(
          <div key={v.id} onClick={()=>setViolations(p=>p.map(x=>x.id===v.id?{...x,done:!x.done}:x))} style={{padding:"13px 16px",cursor:"pointer",borderBottom:i<violations.length-1?`1px solid ${C.border}`:"none",background:v.done?C.surface:C.bg}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:10,height:10,borderRadius:"50%",flexShrink:0,background:v.done?C.green:v.risk>=9?C.red:C.orange}}/>
              <div style={{flex:1}}><div style={{fontSize:14,fontWeight:500,color:v.done?C.subtle:C.primary,textDecoration:v.done?"line-through":"none"}}>{v.name}</div><div style={{fontSize:11,color:C.subtle,marginTop:2}}>{v.deadline} · {v.free?"бесплатно":"платно"}</div></div>
              <Badge color={v.done?C.green:v.risk>=9?C.red:C.orange} bg={v.done?C.greenBg:v.risk>=9?C.redBg:C.orangeBg}>{v.done?"✓":`${v.risk}/10`}</Badge>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OwnerTeam({onDeleteMaster}:{onDeleteMaster:(id:number)=>void}){
  const [masters,setMasters]=useState(MASTERS_DATA);
  const [showInvite,setShowInvite]=useState(false);
  const [copied,setCopied]=useState(false);
  const [confirmDel,setConfirmDel]=useState<number|null>(null);
  const link="https://t.me/studio_os_bot?start=invite_abc123";

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:20,fontWeight:800}}>Команда</div>
        <button onClick={()=>setShowInvite(!showInvite)} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"9px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:F}}>+ Пригласить</button>
      </div>
      {showInvite&&(
        <Card style={{borderColor:C.primary+"33"}}>
          <ST>Ссылка-приглашение</ST>
          <div style={{fontSize:13,color:C.secondary,marginBottom:12,lineHeight:1.5}}>Отправьте мастеру в Telegram. После перехода он привяжется к студии и укажет имя при первом входе.</div>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 14px",fontSize:13,color:C.secondary,marginBottom:12,wordBreak:"break-all" as const}}>{link}</div>
          <button onClick={()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);}} style={{width:"100%",background:copied?C.green:C.primary,color:"#FFF",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:F,transition:"background 0.2s"}}>{copied?"✓ Скопировано!":"Скопировать ссылку"}</button>
        </Card>
      )}
      <Card>
        <ST>Мастера · {masters.length}</ST>
        {masters.map((m,i)=>(
          <div key={m.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 0",borderBottom:i<masters.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:"50%",background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:C.secondary}}>{m.name[0]}</div>
              <div><div style={{fontSize:14,fontWeight:600}}>{m.name}</div><div style={{fontSize:12,color:C.subtle}}>{m.tg} · {m.pct}% от чека</div></div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <Badge color={m.active?C.green:C.subtle} bg={m.active?C.greenBg:C.surface}>{m.active?"Активен":"Неактивен"}</Badge>
              {confirmDel===m.id?(
                <div style={{display:"flex",gap:4}}>
                  <Btn small variant="red" onClick={()=>{setMasters(p=>p.filter(x=>x.id!==m.id));setConfirmDel(null);}}>Удалить</Btn>
                  <Btn small variant="secondary" onClick={()=>setConfirmDel(null)}>Отмена</Btn>
                </div>
              ):(
                <button onClick={()=>setConfirmDel(m.id)} style={{background:"none",border:"none",cursor:"pointer",padding:4}}><Icon name="trash" size={16} color={C.red}/></button>
              )}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function OwnerFeedback(){
  // Имитация входящей обратной связи от мастеров
  const messages=[
    {id:1,from:"Мария Смирнова",text:"Предлагаю добавить новый гель-лак Kodi в расходники, часто используем",date:"14 июл 14:32",read:false},
    {id:2,from:"Ольга Тихонова",text:"Клиентка Морозова попросила записать её только ко мне в следующий раз",date:"13 июл 18:10",read:true},
  ];
  const [msgs,setMsgs]=useState(messages);
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Обратная связь</div>
      {msgs.length===0?<div style={{color:C.subtle,textAlign:"center",marginTop:40,fontSize:14}}>Нет новых сообщений</div>:(
        <div>
          {msgs.map((m,i)=>(
            <Card key={m.id} style={{borderLeft:m.read?"none":`3px solid ${C.primary}`,opacity:m.read?0.7:1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:13,fontWeight:700}}>{m.from}</div>
                <div style={{fontSize:11,color:C.subtle}}>{m.date}</div>
              </div>
              <div style={{fontSize:14,color:C.secondary,lineHeight:1.5,marginBottom:10}}>{m.text}</div>
              {!m.read&&<button onClick={()=>setMsgs(p=>p.map(x=>x.id===m.id?{...x,read:true}:x))} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",fontSize:12,color:C.secondary,cursor:"pointer",fontFamily:F}}>Отметить прочитанным</button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function OwnerMore({setView}:{setView:(v:string)=>void}){
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Разделы</div>
      {[
        {label:"Склад расходников",sub:"Остатки, списание, пополнение",icon:"supply",view:"supplies"},
        {label:"Чек-листы смены",sub:"Открытие, закрытие (редактирование)",icon:"shift",view:"shift"},
        {label:"База знаний",sub:"Стандарты, правила, инструкции",icon:"book",view:"knowledge"},
        {label:"Безопасность",sub:"Индекс, документы, нарушения",icon:"shield",view:"security"},
        {label:"Обратная связь",sub:"Сообщения от мастеров",icon:"msg",view:"feedback"},
        {label:"Команда",sub:"Мастера, приглашения, удаление",icon:"team",view:"team"},
        {label:"Настройки",sub:"Студия, профиль, подписка",icon:"settings",view:"settings"},
      ].map((item,i)=>(
        <Card key={i} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:14}} onClick={()=>setView(item.view)}>
          <div style={{width:40,height:40,borderRadius:12,background:C.surface,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon name={item.icon} size={20} color={C.primary}/></div>
          <div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>{item.label}</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>{item.sub}</div></div>
          <span style={{fontSize:20,color:C.border}}>›</span>
        </Card>
      ))}
    </div>
  );
}

function OwnerSettings({studioName,ownerName,onLogout,onSwitch}:{studioName:string;ownerName:string;onLogout:()=>void;onSwitch:()=>void}){
  return(
    <div>
      <div style={{fontSize:20,fontWeight:800,marginBottom:20}}>Настройки</div>
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#FFF"}}>{ownerName[0]}</div>
          <div><div style={{fontSize:16,fontWeight:800}}>{ownerName}</div><div style={{fontSize:13,color:C.subtle}}>Владелец · {studioName}</div></div>
        </div>
      </Card>
      <Card style={{background:C.greenBg,borderColor:C.green+"44"}}>
        <div style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:4}}>🎉 Бесплатный период</div>
        <div style={{fontSize:12,color:C.secondary}}>Studio OS Pro · Осталось 30 дней</div>
        <div style={{fontSize:12,color:C.subtle,marginTop:4}}>После — 1 490 ₽/мес</div>
      </Card>
      <div onClick={onSwitch} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px 16px",marginBottom:10,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{fontSize:15,fontWeight:600}}>Сменить студию</div><div style={{fontSize:12,color:C.subtle,marginTop:2}}>{studioName}</div></div>
        <span style={{fontSize:20,color:C.border}}>›</span>
      </div>
      <button onClick={onLogout} style={{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,padding:"14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:F}}>
        <Icon name="logout" size={16} color={C.red}/><span style={{fontSize:15,color:C.red,fontWeight:600}}>Выйти</span>
      </button>
    </div>
  );
}

// ══ SELECTORS ═════════════════════════════════════════════════════
function StudioSelector({onSelect}:{onSelect:(s:typeof STUDIOS[0])=>void}){
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",fontFamily:F,background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:40}}>
        <div style={{fontSize:32,fontWeight:800,color:C.primary,letterSpacing:"-1px"}}>Studio OS</div>
        <div style={{fontSize:14,color:C.subtle,marginTop:6}}>Безопасный бизнес</div>
      </div>
      <div style={{width:"100%",maxWidth:390}}>
        <div style={{fontSize:15,fontWeight:700,marginBottom:16}}>Выберите студию</div>
        {STUDIOS.map(s=>(
          <div key={s.id} onClick={()=>onSelect(s)} style={{background:C.bg,border:`1.5px solid ${C.border}`,borderRadius:16,padding:20,marginBottom:10,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{fontSize:16,fontWeight:700}}>{s.name}</div><div style={{fontSize:13,color:C.subtle,marginTop:4}}>{s.address}</div></div>
            <span style={{fontSize:22,color:C.border}}>›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleSelector({studio,onSelect}:{studio:typeof STUDIOS[0];onSelect:(r:"owner"|"master")=>void}){
  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px 20px",fontFamily:F,background:C.bg}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:13,color:C.subtle}}>{studio.name}</div>
        <div style={{fontSize:22,fontWeight:800,marginTop:4}}>Кто вы?</div>
        <div style={{fontSize:12,color:C.subtle,marginTop:8}}>В реальном приложении определяется автоматически</div>
      </div>
      <div style={{width:"100%",maxWidth:390,display:"flex",flexDirection:"column",gap:12}}>
        <button onClick={()=>onSelect("owner")} style={{background:C.primary,color:"#FFF",border:"none",borderRadius:16,padding:"20px",cursor:"pointer",textAlign:"left",fontFamily:F}}>
          <div style={{fontSize:17,fontWeight:800}}>Владелец</div>
          <div style={{fontSize:13,color:"rgba(255,255,255,0.6)",marginTop:6}}>Все разделы, финансы, команда, безопасность</div>
        </button>
        <button onClick={()=>onSelect("master")} style={{background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:16,padding:"20px",cursor:"pointer",textAlign:"left",fontFamily:F}}>
          <div style={{fontSize:17,fontWeight:800,color:C.primary}}>Мастер</div>
          <div style={{fontSize:13,color:C.subtle,marginTop:6}}>Клиенты, визиты, финансы, смена, склад</div>
        </button>
      </div>
    </div>
  );
}

// ══ APP ═══════════════════════════════════════════════════════════
const OWNER_NAV=[{id:"o_home",label:"Главная",icon:"home"},{id:"o_clients",label:"Клиенты",icon:"clients"},{id:"o_visits",label:"Визиты",icon:"visit"},{id:"o_finance",label:"Финансы",icon:"finance"},{id:"o_more",label:"Ещё",icon:"more"}];
const MASTER_NAV=[{id:"m_home",label:"Главная",icon:"home"},{id:"m_clients",label:"Клиенты",icon:"clients"},{id:"shift",label:"Смена",icon:"shift"},{id:"supplies",label:"Склад",icon:"supply"},{id:"m_finance",label:"Финансы",icon:"finance"},{id:"m_more",label:"Ещё",icon:"more"}];

export default function App(){
  const [studio,setStudio]=useState<typeof STUDIOS[0]|null>(null);
  const [role,setRole]=useState<"owner"|"master"|null>(null);
  const [masterName,setMasterName]=useState<{first:string;last:string}|null>(null);
  const [ownerData,setOwnerData]=useState<{first:string;last:string;studio:string}|null>(null);
  const [view,setView]=useState("o_home");
  const [openList,setOpenList]=useState(DEFAULT_OPEN);
  const [closeList,setCloseList]=useState(DEFAULT_CLOSE);

  if(!studio) return <StudioSelector onSelect={s=>{setStudio(s);setRole(null);}}/>;
  if(!role) return <RoleSelector studio={studio} onSelect={r=>{setRole(r);setView(r==="owner"?"o_home":"m_home");}}/>;
  if(role==="master"&&!masterName) return <MasterOnboarding onDone={n=>{setMasterName(n);setView("m_home");}}/>;
  if(role==="owner"&&!ownerData) return <OwnerOnboarding onDone={d=>{setOwnerData(d);setView("o_home");}}/>;

  const mName=masterName?`${masterName.last} ${masterName.first}`:"Мария Смирнова";
  const oName=ownerData?`${ownerData.last} ${ownerData.first}`:"Артём Паутов";
  const sName=ownerData?.studio||studio.name;

  const ownerMoreViews=["supplies","shift","knowledge","security","feedback","team","settings"];
  const masterMoreViews=["knowledge"];

  const titles:Record<string,string>={
    o_home:"",o_clients:"Клиенты",o_visits:"Визиты",o_finance:"Финансы",o_more:"Разделы",
    m_home:"",m_clients:"Мои клиенты",m_visit_new:"Новый визит",m_finance:"Мои финансы",m_more:"Ещё",
    supplies:"Склад",shift:"Чек-листы",knowledge:"База знаний",security:"Безопасность",
    feedback:"Обратная связь",team:"Команда",settings:"Настройки",
  };

  const ownerViews:Record<string,React.ReactNode>={
    o_home:<OwnerHome studioName={sName} setView={setView}/>,
    o_clients:<OwnerClients/>,
    o_visits:<OwnerVisits/>,
    o_finance:<OwnerFinance/>,
    o_more:<OwnerMore setView={setView}/>,
    supplies:<Supplies/>,
    shift:<Shift canEdit openList={openList} closeList={closeList} onSaveLists={(o,c)=>{setOpenList(o);setCloseList(c);}}/>,
    knowledge:<Knowledge canEdit/>,
    security:<OwnerSecurity/>,
    feedback:<OwnerFeedback/>,
    team:<OwnerTeam onDeleteMaster={()=>{}}/>,
    settings:<OwnerSettings studioName={sName} ownerName={oName} onLogout={()=>{setStudio(null);setRole(null);setOwnerData(null);setMasterName(null);}} onSwitch={()=>{setStudio(null);setRole(null);}}/>,
  };

  const masterViews:Record<string,React.ReactNode>={
    m_home:<MasterHome masterName={mName} setView={setView}/>,
    m_clients:<MasterClients masterName={mName} setView={setView}/>,
    m_visit_new:<VisitForm onBack={()=>setView("m_clients")} allVisits={VISITS_DATA} isMaster/>,
    m_finance:<MasterFinance masterName={mName}/>,
    m_more:<MasterMore setView={setView}/>,
    shift:<Shift openList={openList} closeList={closeList}/>,
    supplies:<Supplies/>,
    knowledge:<Knowledge canEdit={false}/>,
  };

  const nav=role==="owner"?OWNER_NAV:MASTER_NAV;
  const currentView=role==="owner"?ownerViews[view]:masterViews[view];
  const isHome=view==="o_home"||view==="m_home";
  const moreActive=role==="owner"?ownerMoreViews.includes(view):masterMoreViews.includes(view);

  return(
    <div style={{maxWidth:430,margin:"0 auto",minHeight:"100vh",background:C.bg,fontFamily:F,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 20px 12px",background:C.bg,borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,zIndex:10,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        {isHome?(
          <div style={{fontSize:11,fontWeight:700,color:C.subtle,letterSpacing:"0.8px",textTransform:"uppercase" as const}}>Studio OS · {sName}</div>
        ):(
          <div style={{fontSize:17,fontWeight:800,color:C.primary,letterSpacing:"-0.3px"}}>{titles[view]||""}</div>
        )}
        <div onClick={()=>role==="owner"?setView("settings"):undefined} style={{width:34,height:34,borderRadius:"50%",background:C.primary,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#FFF",cursor:role==="owner"?"pointer":"default"}}>
          {role==="owner"?oName[0]:mName[0]}
        </div>
      </div>
      <div style={{flex:1,padding:"20px 20px 90px",overflowY:"auto"}}>
        {currentView||<div style={{color:C.subtle,textAlign:"center",marginTop:40,fontSize:14}}>Раздел в разработке</div>}
      </div>
      <nav style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:430,background:C.bg,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,8px)"}}>
        {nav.map(n=>{
          const active=view===n.id||(n.id==="o_more"&&moreActive)||(n.id==="m_more"&&moreActive);
          return(
            <button key={n.id} onClick={()=>setView(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"10px 4px 8px",cursor:"pointer",background:"transparent",border:"none",gap:3}}>
              <Icon name={n.icon} size={22} color={active?C.primary:C.subtle} sw={active?2.2:1.6}/>
              <span style={{fontSize:10,fontWeight:active?700:400,color:active?C.primary:C.subtle}}>{n.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
