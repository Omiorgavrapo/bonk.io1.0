(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BonkMaps=api;})(typeof self!=='undefined'?self:this,function(){
'use strict';
var modes=['classic','arrows','deatharrows','grapple','vtol','football'];
function finite(v,name,min,max,def){if(v==null&&def!=null)return def;v=Number(v);if(!Number.isFinite(v)||v<min||v>max)throw Error('Invalid '+name);return v;}
function text(v,def,max){return String(v==null?def:v).slice(0,max||100);}
function color(v,def){return /^#[0-9a-f]{6}$/i.test(v||'')?v:def;}
function point(p){if(!Array.isArray(p)||p.length!==2)throw Error('Invalid polygon point');return[finite(p[0],'point x',-10000,10000),finite(p[1],'point y',-10000,10000)];}
function polygon(points){
 if(!Array.isArray(points)||points.length<3||points.length>128)throw Error('Polygon needs 3–128 vertices');
 var p=points.map(point),area=0;
 function cross(a,b,c){return(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
 function on(a,b,c){return Math.abs(cross(a,b,c))<1e-8&&c[0]>=Math.min(a[0],b[0])-1e-8&&c[0]<=Math.max(a[0],b[0])+1e-8&&c[1]>=Math.min(a[1],b[1])-1e-8&&c[1]<=Math.max(a[1],b[1])+1e-8;}
 for(var i=0;i<p.length;i++){
  var a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];
  if(Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5)throw Error('Polygon has a duplicate vertex');
  for(var j=i+2;j<p.length;j++){
   if(i===0&&j===p.length-1)continue;var c=p[j],d=p[(j+1)%p.length];
   if((cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('Polygon must not intersect itself');
  }
 }
 if(Math.abs(area)<1)throw Error('Polygon area is too small');if(area<0)p.reverse();return p;
}
function validate(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Map must be an object');
 if(raw.version!=null&&raw.version!==1)throw Error('Unsupported map version');
 if(modes.indexOf(raw.mode)<0)throw Error('Unknown game mode');
 if(!Array.isArray(raw.bodies)||raw.bodies.length>300)throw Error('Map must contain at most 300 bodies');
 var map={version:1,id:text(raw.id,'custom',80),name:text(raw.name,'Untitled map',80),author:text(raw.author,'Local',80),mode:raw.mode,width:finite(raw.width,'width',200,6000,1000),height:finite(raw.height,'height',200,6000,700),background:color(raw.background,'#cfd8dc'),gravity:finite(raw.gravity,'gravity',-3,3,1),bodies:[],spawns:[],goals:[],zones:[],joints:[],source:raw.source&&typeof raw.source==='object'?{url:text(raw.source.url,'',500),evidence:text(raw.source.evidence,'',1000),historicalVerified:raw.source.historicalVerified===true}:{url:'',evidence:'Local custom map',historicalVerified:false}};
 var ids={};
 raw.bodies.forEach(function(b,i){
  if(!b||typeof b!=='object')throw Error('Invalid body');var id=text(b.id,'body-'+i,80);if(ids[id])throw Error('Duplicate body id');ids[id]=true;
  if(['rect','circle','polygon'].indexOf(b.shape)<0)throw Error('Unknown shape');
  var inert=b.noPhysics===true||b.sensor===true;
  var o={id:id,shape:b.shape,x:finite(b.x,'body x',-10000,10000),y:finite(b.y,'body y',-10000,10000),angle:finite(b.angle,'angle',-36000,36000,0),type:['static','dynamic','kinematic'].indexOf(b.type)>=0?b.type:'static',color:color(b.color,'#607d8b'),density:finite(b.density,'density',inert?-1e6:0.01,inert?1e6:1000,1),friction:finite(b.friction,'friction',inert?-1e6:0,inert?1e6:10,.3),restitution:finite(b.restitution,'bounce',inert?-1e6:0,inert?1e6:1.5,.2),lethal:b.lethal===true,fixedRotation:b.fixedRotation===true};
  ['noPhysics','noGrapple','sensor'].forEach(function(key){if(b[key]===true)o[key]=true;});
  ['linearDamping','angularDamping'].forEach(function(key){if(b[key]!=null)o[key]=finite(b[key],key,0,1000);});
  if(o.shape==='rect'){o.w=finite(b.w,'width',1,12000);o.h=finite(b.h,'height',1,12000);}
  if(o.shape==='circle')o.r=finite(b.r,'radius',1,6000);
  if(o.shape==='polygon'){
   o.points=polygon(b.points);
  }
  ['linearVelocity','force'].forEach(function(key){if(b[key])o[key]={x:finite(b[key].x,key+' x',-10000,10000,0),y:finite(b[key].y,key+' y',-10000,10000,0)};});
  o.angularVelocity=finite(b.angularVelocity,'angular velocity',-1000,1000,0);map.bodies.push(o);
 });
 if(!Array.isArray(raw.spawns)||raw.spawns.length<1||raw.spawns.length>24)throw Error('Map needs 1–24 spawns');
 raw.spawns.forEach(function(s){map.spawns.push({x:finite(s.x,'spawn x',-2000,8000),y:finite(s.y,'spawn y',-2000,8000),team:s.team===2?2:1});});
 ['goals','zones'].forEach(function(key){if(raw[key]!=null&&!Array.isArray(raw[key]))throw Error('Invalid '+key);if((raw[key]||[]).length>100)throw Error('Too many '+key);(raw[key]||[]).forEach(function(z){var o={x:finite(z.x,key+' x',-10000,10000),y:finite(z.y,key+' y',-10000,10000),w:finite(z.w,key+' width',1,12000),h:finite(z.h,key+' height',1,12000),team:z.team===2?2:z.team===1?1:0};if(key==='zones'){o.forceX=finite(z.forceX,'zone x force',-1000,1000,0);o.forceY=finite(z.forceY,'zone y force',-1000,1000,0);o.lethal=z.lethal===true;if(z.capture===true){o.capture=true;o.captureTicks=finite(z.captureTicks,'capture ticks',1,36000,180);}}map[key].push(o);});});
 if(raw.ballSpawn)map.ballSpawn={x:finite(raw.ballSpawn.x,'ball spawn x',-2000,8000),y:finite(raw.ballSpawn.y,'ball spawn y',-2000,8000)};
 if(raw.joints!=null&&!Array.isArray(raw.joints))throw Error('Invalid joints');if((raw.joints||[]).length>100)throw Error('Too many joints');
 (raw.joints||[]).forEach(function(j,i){if(!ids[j.bodyA]||!ids[j.bodyB]||j.bodyA===j.bodyB)throw Error('Joint needs two existing bodies');if(['revolute','distance'].indexOf(j.type)<0)throw Error('Unknown joint type');map.joints.push({id:text(j.id,'joint-'+i,80),type:j.type,bodyA:j.bodyA,bodyB:j.bodyB,x:finite(j.x,'joint x',-10000,10000,0),y:finite(j.y,'joint y',-10000,10000,0),length:finite(j.length,'joint length',0,15000,100),frequency:finite(j.frequency,'spring frequency',0,100,0),damping:finite(j.damping,'damping',0,10,.2),motorSpeed:finite(j.motorSpeed,'motor speed',-1000,1000,0),maxMotorTorque:finite(j.maxMotorTorque,'motor torque',0,1e6,0),enableMotor:j.enableMotor===true});});
 return map;
}
function body(id,x,y,w,h,color,extra){return Object.assign({id:id,shape:'rect',x:x,y:y,w:w,h:h,angle:0,type:'static',color:color||'#607d8b',density:1,friction:.3,restitution:.2},extra||{});}
function make(id,name,mode,bodies,spawns,extra){return validate(Object.assign({version:1,id:id,name:name,author:'Local reconstruction',mode:mode,width:1000,height:700,background:'#cfd8dc',gravity:1,bodies:bodies,spawns:spawns||[{x:260,y:250,team:1},{x:740,y:250,team:2},{x:380,y:160,team:1},{x:620,y:160,team:2},{x:180,y:170,team:1},{x:820,y:170,team:2},{x:430,y:100,team:1},{x:570,y:100,team:2}],goals:[],zones:[],joints:[],source:{url:'',evidence:'Original local arena; not a verified 2025 map replica.',historicalVerified:false}},extra||{}));}
var maps=[
 make('local-flat','Flat arena','classic',[body('floor',500,500,720,35),body('left',230,385,180,20),body('right',770,385,180,20)]),
 make('local-islands','Islands','classic',[body('left',240,440,230,30),body('right',760,440,230,30),body('mid',500,350,140,30),body('top',500,190,270,20)]),
 make('local-pendulum','Pendulum','classic',[body('floor',500,560,750,25),body('anchor',500,260,20,20),body('beam',500,375,350,25,'#795548',{type:'dynamic',density:2})],null,{joints:[{id:'hinge',type:'revolute',bodyA:'anchor',bodyB:'beam',x:500,y:340}]}),
 make('local-arrows','Arrow platforms','arrows',[body('floor',500,580,800,30),body('l',200,410,160,20),body('m',500,335,180,20),body('r',800,410,160,20)]),
 make('local-arrows-duel','Arrow duel','arrows',[body('left',240,500,250,35),body('right',760,500,250,35),body('mid',500,285,120,20)]),
 make('local-death','Death arrows arena','deatharrows',[body('floor',500,570,820,30),body('l',270,390,130,25),body('r',730,390,130,25),body('ceiling',500,130,280,20)]),
 make('local-death-islands','Death islands','deatharrows',[body('l',250,500,230,30),body('r',750,500,230,30),body('m',500,330,120,30)]),
 make('local-grapple','Grapple course','grapple',[body('floor',500,620,650,25),body('l',250,210,200,25),body('m',500,120,180,30),body('r',750,210,200,25),body('island',500,420,190,25)]),
 make('local-grapple-towers','Grapple towers','grapple',[body('l',150,400,120,320),body('r',850,400,120,320),body('anchor',500,100,130,35),body('floor',500,610,500,25)]),
 make('local-vtol','VTOL arena','vtol',[body('floor',500,595,740,35),body('l',230,365,150,20),body('r',770,365,150,20),body('m',500,210,180,25)]),
 make('local-vtol-sky','VTOL sky islands','vtol',[body('l',220,480,210,30),body('r',780,480,210,30),body('m',500,340,180,25),body('top',500,140,240,20)]),
 make('local-football','Football field','football',[body('floor',500,575,1000,35),body('top',500,45,1000,30),body('lwall',20,270,25,430),body('rwall',980,270,25,430)], [{x:250,y:410,team:1},{x:750,y:410,team:2},{x:330,y:410,team:1},{x:670,y:410,team:2},{x:150,y:410,team:1},{x:850,y:410,team:2},{x:410,y:410,team:1},{x:590,y:410,team:2}],{goals:[{x:55,y:510,w:70,h:110,team:1},{x:945,y:510,w:70,h:110,team:2}]}),
 make('local-football-steps','Football steps','football',[body('floor',500,590,1000,30),body('lwall',20,280,25,460),body('rwall',980,280,25,460),body('lstep',320,500,150,20),body('rstep',680,500,150,20)],null,{goals:[{x:55,y:520,w:70,h:110,team:1},{x:945,y:520,w:70,h:110,team:2}]})
];
return{maps:maps,validate:validate,modes:modes,make:make};
});
