var ctx;
var uictx;
var canvas;
var uicanvas;
var timer;
var currentUI=frame;

var csslolcode="#strategydiv{overflow:hidden}"+
				"#strategycanvas{overflow:hidden}";

window.addEventListener('load',boot,false);
window.addEventListener('keydown',keydown,false);
window.addEventListener('keyup',keyup,false);
var width=1000;
var height=1000;
var hwidth=500;
var hheight=500;
var screenScale=1;
var worldmap;
var nodes=[];
var curnod;
var curx=0;
var cury=0;
var zoom=75;
var moving=[0,0,0,0,0];
var panstart=[0,0];
var pan=[0,0];
var mouse=[width/2,height/2];
var clicked=false;
var panning=false;
var selecting=false;
var dragged=false;
var mousedown=[0,0];
var fullscreen=false;
var hoverhex=null;
var lasthex=null;
var selected=[];
var lockFPS=25;//25
var world=[];
var remov=[];
var picked=0;
var ltick=0;
var tickevery=250;
var ticks=0;
var fps=new Fpstracker(frameRate);
var lframe=0;
var realtime=0;
var graphics={};
graphics.zoomLevel=0;
var zoomByMouse=10;
var level="<level width='16' height='16'><etile id='2,2' /></level>";
/*function findPath(node,dest) { //incomplete pathfinding
	var openset=[{n:node, x:node.id[0], y:node.id[1], f:0, g:0, p:null}];
	var closedset=new Array();
	var reached=false;
	function calcG(node,dest) {return 0;}
	function calcH(node,dest) {return distance(node.id[0],node.id[1],dest.id[0],dest.id[1]);}
	function calcF(node,dest,g) {return calcH(node,dest)+g;}
	var gscore=0;
	while (!done && openset.length > 0) {
		var lowestf=openset[i];
		for (var i in openset) {
			if (openset[i].f < lowestf.f) lowestf=openset[i];
		}//lowestf becomes the object with lowest f
		if (lowestf.n==dest) break; //if we're there, complete
		else {
			Array.removeItem(openset,lowestf);
			for (i in lowestf.n.nodes) {
				Array.findByNode(closedset,lowestf.n.nodes[i]);
				if (3 > -1 && lowestf.g < 3) {
					
				}
			}
		}
		
	}
}*/
var mapwide=8;
var maphigh=4;

function resizeTest(x, y) {
	parseLevel('<level width="' + x + '" height="' + y + '"><etile id="2,2" /></level>');
}

function boot() {
	var styleelement=document.createElement("style");
	styleelement.type="text/css";
	styleelement.innerHTML=csslolcode;
	document.getElementsByTagName("head")[0].appendChild(styleelement);
	$("strategydiv").innerHTML="<canvas id=\"strategycanvas\" width=\""+(width/screenScale)+"\" height=\""+(height/screenScale)+"\" style=\"cursor:default;left:0px;top:0px;width:"+width+"px;height:"+height+"px\" onmousemove='movedmouse(event)' onmousedown='mdown(event)' onmouseup='mup(event)' onclick='mclick(event)' onmouseover='mover(event)' onmouseout='mout(event)' oncontextmenu='return false' style='display:'>Your browser doesn't support HTML5. Please use Google Chrome, Opera, Safari, Firefox, etc; IE won't work</canvas>";
	canvas=$("strategycanvas");
	canvas.addEventListener('DOMMouseScroll', mouseWheel, false);
	canvas.addEventListener('mousewheel', mouseWheel, false);
	//document.getElementsByTagName("body")[0].addEventListener('resize',resizeEvent,false);
	//document.getElementsByTagName("body")[0].onresize="resizeEvent()";
	resize();
	//pan=[-width/2,-height/2];
	pan=[0,0];
	ctx=canvas.getContext("2d");
	ctx.fillStyle="black";
	//worldmap=new HexMap(mapwide,maphigh);
	parseLevel(level);
	//nodes=worldmap.nodes;
	if (false) {
		//for (var i in nodes) {
		for (var i = 0, l = nodes.length;i < l;i++) {
			if (Math.random() < .9) addWorld(randomThing(nodes[i]));
		}
	}
	/*for (var m=0;m<4;m++) {
		var someside=worldmap.side(m);
		for (i in someside) {
			someside[i].highlight=["red","red"];
		}
	}*/
	//while (Math.random() < 0.99) {
	//	randomThing(nodes[Math.floor(Math.random()*nodes.length)]);
	//}
	//paused=false;
	clearInterval(timer);
	setfps(lockFPS);
	//calcOnScreen();
}
function parseLevel(level) {
	var success=true;
	parser=new DOMParser();
	xmlDoc=parser.parseFromString(level,"text/xml");
	var x=xmlDoc.getElementsByTagName("level");
	var wide=2;
	var high=2;
	var impasse=new Array();
	//for (i in x) {
	for (var i = 0, l = x.length;i < l;i++) {
		if (x[i].childNodes != undefined) {
			wide=parseInt(x[i].getAttribute("width"));
			high=parseInt(x[i].getAttribute("height"));
			x2=x[i].getElementsByTagName("etile");
			//for (i2 in x2) {
			for (var i2 = 0, l2 = x2.length;i2 < l2;i2++) {
				var id=x2[i].getAttribute("id");
				impasse.push(id);
				//return node;
				//var name=x[i].getElementsByTagName("name")[0].childNodes[0].nodeValue;
			}
		}
	}
	ctx.clearRect(0,0,width,height);
	nodes=new Array();
	worldmap=new HexMap(wide,high);
	//for (i in impasse) {
	for (var i = 0, l = impasse.length;i < l;i++) {
		var node=nodes[Array.findById(nodes,impasse[i])];
		node.colors=["rgb(12,12,12)","rgb(0,0,0)"];
		node.needUpdate=true;
		node.unbuildable=true;
	}
	pan[0]=width/2-worldmap.width*zoom/2;
	pan[1]=height/2-worldmap.height*zoom/2;
	calcOnScreen();
}
function frameRate(fps) {
	if ($("fps").innerHTML !=fps+"fps") $("fps").innerHTML=fps+"fps";
	lframe=this.last();
	realtime=lframe/tickevery
}
function setfps(fpslock) {
	clearInterval(timer);
	timer=setInterval("currentUI()",fpslock);
}
function addWorld(thing) {
	world.push(thing);
}
function removeWorld(thing) {
	remov.push(thing);
}
var panStore=[0,0,false];
var zoomStore=[0,0,false];
function frame() {
	fps.run();
	//var now=Date.now();
	
	if (zoomStore[2]) {zoomStore[1]=mouse;zoomStore[2]=false;}
	if (zoomStore[0] != 0) {
		//if (zoomStore[0]
		var by=(zoomStore[0]*0.2);
		goZoom(by,zoomStore[1]);
		zoomStore[0]-=by;
		//dbg(zoomStore[0]);
		if (Math.abs(zoomStore[0]) < 0.5) {zoomStore[0]=0;}
		//goZoom(zoomStore[0],zoomStore[1]);
		//zoomStore[0]=0;
	}
	
	if (panStore[2]) {panStore[0]+=panstart[0];panStore[1]+=panstart[1];panStore[2]=false;}
	if (panStore[0] != 0 || panStore[1] != 0) {
		goPan(panStore[0],panStore[1]);panStore=[0,0];
	}
	ltick+=fps.last();
	if (ltick > tickevery) {
		ticks++;
		//dbg(ticks);
		ltick-=tickevery;
		//for (var i in world) {
		for (var i = 0, l = world.length;i < l;i++) {
			world[i].tick();
		}
	}
	//for (var i in world) {
	for (var i = 0, l = world.length;i < l;i++) {
		world[i].act();
	}
	//for (var i in remov) {
	for (var i = 0, l = remov.length;i < l;i++) {
		Array.removeItem(world,remov[i]);
	}remov=new Array();
	reScreen();
	//var pri=nodes[30].priority();
	//dbg(1/(1-pri/(pri+0.1)));
}
var forceUpdate=true;
var pandir=[null,null];
function goPan(x,y) {
	//var lx=0, ly=0, w=0, h=0; blah blah blah optimization blah only move the thing itself
	//if (pan[0] > 0) lx=pan[0]-zoom;
	
	//var cpy=ctx.getImageData(0,0,width,height);
	//ctx.putImageData(cpy,-(pan[0]-x),-(pan[1]-y));
	//ctx.drawImage(canvas, -(pan[0]-x), -(pan[1]-y), width, height);
	
	var dx=pan[0]-x;
	var dy=pan[1]-y;
	pan=[x,y];
	forceUpdate=true;
	var xd=false,yd=false;
	if (dx < 0) {ctx.clearRect(0,0,-dx,height);xd=true;}
	else ctx.clearRect(width-dx,0,dx,height);
	if (dy < 0) {ctx.clearRect(0,0,width,-dy);yd=true;}
	else ctx.clearRect(0,height-dy,width,dy);
	var pd=[xd,yd];
	//if (pandir[0]!=xd || pandir[1]!=yd) xd=yd=null;
	pandir=pd;
	//calcOnScreen(xd,yd);
	calcOnScreen();
	/*var onscreen=[Math.floor(pan[0]/-zoom)-1,Math.floor(pan[1]/-zoom),Math.floor((width)/-zoom),Math.floor((height)/-zoom)];
	dbg(onscreen);*/
}
function panTo(x,y) {
	panStore[0]=x;
	panStore[1]=y;
	panStore[2]=true;
}
function goZoom(by,center) {
	if (zoom+by <= 2) by=2-zoom;
	if (by != 0) {
		var ozoom=zoom;
		zoom+=by;
		var x,y;
		var panstrt=[pan[0],pan[1]];
		pan[0]-=center[0];
		pan[1]-=center[1];
		x=(pan[0])*(by/ozoom)+center[0];
		y=(pan[1])*(by/ozoom)+center[1];

		pan[0]+=x;

		pan[1]+=y;
		panstart[0]+=pan[0]-panstrt[0];
		panstart[1]+=pan[1]-panstrt[1];
		//reScreen(true);
		//var timg=canvas.toDataURL("image/jpeg");
		//x+=(pan[0])/(ozoom/by);
		//y+=(pan[1])/(ozoom/by);
		x=(center[0]-center[0]*(zoom/ozoom));
		y=(center[1]-center[1]*(zoom/ozoom));
		var w=width*(zoom/ozoom);
		var h=height*(zoom/ozoom);
		//x*=(by/ozoom);
		//y*=(by/ozoom);
		/*ctx.drawImage(canvas,x,y,w,h);
		if (by < 0) {
			//ctx.clearRect(0,0,width,y);
			//ctx.clearRect(0,0,x,height);
			//ctx.clearRect(width-x,0,width-w,height);
			//ctx.clearRect(0,height-y,width,height-h);
			if (pan[0] > 0) {
				ctx.clearRect(0,0,pan[0]-zoom/2,height);
				var mside=worldmap.side(0);
				//for (i in mside) {
				for (var i = 0, l = mside.length;i < l;i++) {
					mside[i].needUpdate=true;
				}
			}
			if (pan[1] > 0) {
				ctx.clearRect(0,0,width,pan[1]-zoom*1/3);
				var mside=worldmap.side(1);
				//for (i in mside) {
				for (var i = 0, l = mside.length;i < l;i++) {
					mside[i].needUpdate=true;
				}
			}
			var br=nodes[nodes.length-1].pos();
			if (br[0] < width) {
				ctx.clearRect(br[0]+zoom/2*(worldmap.width%2*-1+1),0,width-br[0],height);
				var mside=worldmap.side(2);
				//for (i in mside) {
				for (var i = 0, l = mside.length;i < l;i++) {
					mside[i].needUpdate=true;
				}
			}
			if (br[1] < height) {
				ctx.clearRect(0,br[1]+zoom*1/3,width,height-br[1]);
				var mside=worldmap.side(3);
				//for (i in mside) {
				for (var i = 0, l = mside.length;i < l;i++) {
					mside[i].needUpdate=true;
				}
			}
			
			calcOnScreen();
		}
		else calcOnScreen(true);*/
		forceUpdate = true;
		calcOnScreen();
	}
}
function zoomTo(by,center) {
	zoomStore[0]+=by;
	//zoomStore[1]=center;
	zoomStore[2]=true;
}
function testOnScreen(pos,xd,yd) {
	var x=pos[0],y=pos[1];
	uz=zoom/2;
	yz=zoom*2/3;
	var innerx=+uz;
	var innery=+yz;
	var innerw=width-uz;
	var innerh=height-yz;
	if (xd != null) {
		if (xd) innerw=width+uz;
		else innerx=-uz;
		if (yd) innerh=height+yz;
		else innery=-yz;
	}
	if (x > innerx && y > innery && x < innerw && y < innerh) {return true;}
	if (x > -uz && y > -yz && x < width+uz && y < height+yz) {return null;}
	return false;
}
function calcOnScreen(xd,yd) {
	var nonull=false;
	if (xd && yd == null) {xd=null;nonull=true;}
	//for (var i in nodes) {
	for (var i = 0, l = nodes.length;i < l;i++) {
		if (nodes[i] != null) {
			var cnode=testOnScreen(nodes[i].pos(),xd,yd);
			if (nonull && cnode==null) cnode=true;
			nodes[i].screen(cnode);
		}
	}
}
var fullscreen=true;
function fullscreenToggle(fs) {
	fullscreen=fs;
}
function resizeEvent() {

	if (fullscreen) {
		resize();
		reScreen(true);
	}
}
function resize() {
	if (fullscreen) { //fullscreen
		$("strategydiv").style.left=0;
		$("strategydiv").style.top=0;
		$("strategydiv").style.width=self.innerWidth;
		$("strategydiv").style.height=self.innerHeight;
	}
	offset=findPos(canvas);
	width=parseInt($("strategydiv").offsetWidth)/screenScale;
	height=parseInt($("strategydiv").offsetHeight)/screenScale;
	hwidth=width/2;
	hheight=height/2;
	canvas.width=width;
	canvas.height=height;
	canvas.style.width=width*screenScale+"px";
	canvas.style.height=height*screenScale+"px";
}


function clearScreen() {
	ctx.clearRect(0,0,width,height);
}
function refreshScreen(force) {
	/*for (var i in nodes) {testdraw(nodes[i]);}
	if (hoverhex != null) testdraw(hoverhex,rgba(255,255,255,0.1),0);
	*/
	var hoverupdate=false;
	//if (hoverhex != null) {hoverupdate=true;hoverhex.needUpdate=true;}
	//for (var i in nodes) {nodes[i].draw(force);}
	for (var i = 0, l = nodes.length;i < l;i++) { nodes[i].draw(force); }
	//if (hoverupdate) testdraw(hoverhex,rgba(255,255,255,0.1),0);
}
function reScreen(force) {
	if (forceUpdate) force=true;
	if (force) clearScreen();
	refreshScreen(force);
	forceUpdate=false;
}
function clearSelect() {
	//for (var i in selected) { selected[i].select(false); }
	for (var i = 0,l = selected.length;i < l;i++) { selected[i].select(false); }
	selected=new Array();
}
function addSelect(node) {
	if (node != null) {
		Array.removeItem(selected,node);
		selected.push(node);
		node.select(true);
	}
}
function deSelect(node) {
	if (node != null) {
		Array.removeItem(selected,node);
		node.select(false);
	}
}
function movedmouse(e) {
	var lasthex=hoverhex;
	mouse=[e.clientX-offset[0]+window.pageXOffset,e.clientY-offset[1]+window.pageYOffset];
	mouse[0]/=screenScale;mouse[1]/=screenScale;
	var mindist=zoom*0.7;
	var closest=null;
	if (panning) {
		panTo(mouse[0]-mousedown[0],mouse[1]-mousedown[1]);
	}else {
		for (var i = 0, l = nodes.length; i < l; i++) {
			var node=nodes[i];
			var pos=node.pos();
			var d=distance(mouse[0],mouse[1],pos[0],pos[1]);
			if (d < mindist) {mindist=d;closest=node;}
		}
		hoverhex=closest;
		if (selecting) {
			if (hoverhex != selected[selected.length-1] && hoverhex != null && hoverhex.content.length > 0) {
				addSelect(hoverhex);
				dragged=true;
			}
		}
		if (lasthex != hoverhex) {
			if (lasthex != null) lasthex.hover(false);
			if (hoverhex != null) hoverhex.hover(true);
		}
	}
	if (distance(mouse[0],mouse[1],mousedown[0],mousedown[1]) > 3) dragged=true;
}
function mdown(e) {
	dragged=false;
	var redraw=true;
	if (event.which == 3) {
		panstart=[pan[0],pan[1]];
		mousedown=[e.clientX-offset[0]+window.pageXOffset,e.clientY-offset[1]+window.pageYOffset];
		mousedown[0]/=screenScale;
		mousedown[1]/=screenScale;
		panning=true;
	}
	if (event.which == 2) {
	}
	if (event.which == 1) {
		if (e.shiftKey) {
			/*if (hoverhex != null && hoverhex.content != null) {
				addSelect(hoverhex);
			}*/
			selecting=true;
		}else if (e.ctrlKey) {
			/*if (hoverhex != null && hoverhex.content != null) {
				if (hoverhex.selected) deSelect(hoverhex);
			}*/
		}else {
			clearSelect();
			if (hoverhex != null && hoverhex.content.length > 0) {
				addSelect(hoverhex);
			}
			selecting=true;
		}
	}
	clicked=true;
}
function mup(e) {
	if (e.which == 1) {
		if (!dragged) {
			
		}
	}
	if (e.which == 3 && !dragged) {
		clearSelect();
	}
	panning=false;
	clicked=false;
	selecting=false;
}
function mclick(e) {
	if (e.which == 1) {
		if (!dragged) {
			if (e.shiftKey) {
				if (hoverhex != null && hoverhex.content.length > 0) {
					addSelect(hoverhex);
				}
			}else if (e.ctrlKey) {
				if (hoverhex != null && hoverhex.content.length > 0) {
					if (hoverhex.selected) deSelect(hoverhex);
					else addSelect(hoverhex);
				}
			}else {
				clearSelect();
				addSelect(hoverhex);
			}
		}
	}
}
function mover(e) {
}
function mout(e) {
}
function mouseWheel(e) { //http://www.switchonthecode.com/tutorials/javascript-tutorial-the-scroll-wheel thx
	function inMap(mss) {
		if (mss[0] < pan[0]) mss[0]=pan[0];
		if (mss[0] > nodes[nodes.length-1].pos()[0]) mss[0]=nodes[nodes.length-1].pos()[0];
		if (mss[1] < pan[1]) mss[1]=pan[1];
		if (mss[1] > nodes[nodes.length-1].pos()[1]) mss[1]=nodes[nodes.length-1].pos()[1];
	}
	e = e ? e : window.event;
	var wheelData = e.detail ? e.detail * -1 : e.wheelDelta / 40;
	zoomTo((wheelData/Math.abs(wheelData))*zoomByMouse,inMap(mouse));
	return cancelEvent(e);
}
function keydown(e) {
	switch(e.keyCode) {
		case 87:
			;break; //w
		case 65:
			if (selected.length > 0) for (var i in selected) {addWorld(randomThing(selected[i]));}
			else addWorld(randomThing(hoverhex));
			reScreen();
			break; //a
		case 83:
			;break; //s
		case 68:
			if (selected.length > 0) for (var i in selected) {selected[i].clearContent();}
			else hoverhex.clearContent();
			reScreen();
			break; //d
		case 69:
			;break; //e
		case 67:
			dbg("");break; //c
		case 88:
			goZoom(1,[width/2,height/2]);reScreen();break; //x
		case 90:
			goZoom(-1,[width/2,height/2]);reScreen();break; //z
		case 27:
			clearInterval(timer);break;
		case 16:case 17:case 18:case 20:break;
		default:dbg(e.keyCode);
	}
}
function testmove(dir) {
	if (curnod.nodes[dir] != null) {
		var dist=getDistance(dir);
		curx+=dist[0];
		cury+=dist[1];
		curnod=curnod.nodes[dir];
	}
}
function keyup(e) {
}

//Factory object
function Factory(node,script,id) {
	this.id=id;
	this.node=node;
	this.script=parseMoveScript(script);
	this.factory=[];
	this.setFactory=factorySetFactory;
	this.progress=0;
	this.progticks=0;
	this.act=factoryAct;
	this.tick=factoryTick;
}
function factorySetFactory(script) {
	
}
function factoryAct() {
}
function factoryTick() {
	if (this.progress < this.factory.length) {
		this.progticks++;
		if (this.progticks < this.factory[progress]) {
			
		}
	}
}
function parseMoveScript(script) {
	var os=new Array();
	for (i in script) {
		os.push(parseInt(script[i]));
	}
	return os;
}
//Enemy object
function Enemy(node,script,mesh,health,speed,colormap) {
	this.node=node;
	this.node.addContent(this);
	this.health=health;
	this.maxhealth=health;
	this.movespeed=speed;
	this.colormap=colormap;
	this.moveticks=0;
	this.script=script;
	this.scriptprogress=0;
	this.act=enemyAct;
	this.tick=enemyTick;
	this.move=objectMove;
	this.hit=enemyHit;
	this.die=enemyDie;
	this.combat=enemyCombat;
	this.draw=enemyDraw;
	this.mesh=new Mesh(mesh);
}
function enemyAct() {

}
function enemyTick() {
	this.moveticks++;
	if (this.moveticks > this.movespeed) {
		if (this.scriptprogress == this.script.length) {
			this.die();
			picked++;
			dbg("One got through! " + picked);
		}else {
			this.move(this.script[this.scriptprogress++]);
			this.moveticks=0;
		}
	}
}
function objectMove(direction) {
	this.node.removeContent(this);
	this.node.nodes[direction].addContent(this);
	this.node=this.node.nodes[direction];
}
function enemyHit(by) {
}
function enemyDie() {
	this.node.removeContent(this);
	this.node=null;
	removeWorld(this);
}
function enemyCombat() {
}
function enemyDraw() {
	this.mesh.drawToZoom(this.colormap[0],this.colormap[1],this.node.pos());
}

function basicEnemy(node,script) {
	this.parent=Enemy;
	this.parent(node,script,[[-80,-80],[80,-80],[80,80],[-80,80],[-80,-80]],25,4,["blue","green"]);
}
/*linked hex map object*/
function HexMap(width,height) {
	this.core;
	this.size=width*height;
	this.width=width;
	this.height=height;
	this.side=hexside;
	this.nodes=new Array();
	generateHexRect(this,width,height);
}
var hexColors=[
	["rgb(25,25,25)","rgb(0,0,0)"], //standard
	[rgba(255,255,255,0.2),rgba(255,255,255,0.2)], //hover
	[rgba(150,255,150,0.2),rgba(50,255,50,0.4)] //selected
];
function hexside(side) { //left top right down
	var begin,boundary,inc;
	switch (side) {
		case 0:
			begin=1;
			boundary=this.height;
			inc=2;
			break;
		case 1:
			begin=0;
			boundary=this.width*this.height;
			inc=maphigh;
			break;
		case 2:
			begin=(this.width-1)*(this.height);
			boundary=this.height*this.width;
			inc=2;
			break;
		case 3:
			begin=this.height-1;
			boundary=this.width*this.height;
			inc=this.height;
			break;
	}
	var returns=new Array();
	for (i = begin;i < boundary;i+=inc) {
		returns.push(nodes[i]);
	}
	return returns;
}

//HexNode object
function HexNode(nodes,content,palette) {
	this.nodes=nodes;
	if (nodes == undefined) this.nodes=[null,null,null,null,null,null];
	/*var nodes=[l,tl,tr,r,br,bl];
	this.l=l;
	this.tl=tl;
	this.tr=tr;
	this.r=r;
	this.br=br;
	this.bl=bl;*/
	this.id=[null,null];
	this.pos=hexPos;
	this.content=new Array();
	this.setContent=hexContent;
	this.addContent=hexAddContent;
	this.removeContent=hexRemoveContent;
	this.clearContent=hexClearContent;
	this.colors=hexColors[0];
	//this.nodes=hexNodes;
	this.corner=hexCorner;
	this.draw=hexDraw;
	this.needUpdate=false;
	this.selected=false;
	this.hovering=false;
	this.hover=hexHover;
	this.select=hexSelect;
	this.priority=hexPriority;
	this.zoom=0;
	this.pan=0;
	this.onScreen=false;
	this.screen=hexScreen;
	this.highlight=null;
	this.unbuildable=false;
}
function hexScreen(screen) {
	if (screen==null || (screen && screen != this.onScreen)) {this.needUpdate=true;}
	this.onScreen=screen;
}
function hexAddContent(content) {
	this.content.push(content);
	this.needUpdate=true;
}
function hexRemoveContent(content) {
	Array.removeItem(this.content,content);
	this.needUpdate=true;
}
function hexClearContent() {
	this.content=new Array();
	this.needUpdate=true;
}
function hexContent(content) {
	this.content=content;
	this.needUpdate=true;
}
function hexHover(hovering) {
	if (this.hovering != hovering) {
		this.hovering=hovering;
		this.needUpdate=true;
	}
}
function hexSelect(selected) {
	if (selected != this.selected) {
		this.selected=selected;
		this.needUpdate=true;
	}
}
function hexPriority() {
	if (this.onScreen == false) return null;
	if (this.needUpdate) return 0;
	if (this.zoom != zoom)
		if (graphics.zoomLevel==5) return 0;
		else return (zoomStore[0] != 0 ? nodes.length : 1)/(1-Math.min(this.zoom,zoom)/Math.max(zoom,this.zoom))
		//else return 5+1/Math.abs(this.zoom-zoom)*5;
	return null;
}
function hexPos() {
	return [this.id[0]*zoom+pan[0],this.id[1]*zoom+pan[1]];
}
function hexNodes() {
	return [this.l,this.tl,this.tr,this.r,this.br,this.bl];
}
function hexDraw(force) {
	var pri=this.priority();
	//if (pri > 0) dbg(pri);
	if (pri == 0 || (pri != null && pri < (pri+0.3)*Math.random()) || force) {
		this.zoom=zoom;
		//this.pan=(pan[0]*1000+pan[1]);
		mepos=this.pos();
		var x=mepos[0];
		var y=mepos[1];
		var points=new Array();
		tzoom=zoom-1;
		traceHex(x,y,tzoom);
		ctx.fillStyle=this.colors[0];
		ctx.strokeStyle=this.colors[1];
		ctx.stroke();
		ctx.fill();
		for (i in this.content) this.content[i].draw();
		
		if (this.selected) {
			ctx.fillStyle=hexColors[2][0];
			ctx.strokeStyle=hexColors[2][1];
			
			tzoom=zoom-2;
			traceHex(x,y,tzoom);
			if (zoom > 10) ctx.stroke();
			ctx.fill();
		}
		if (this.hovering) {
			ctx.fillStyle=hexColors[1][0];
			ctx.strokeStyle=hexColors[1][1];
			if (tzoom != zoom-2)
			tzoom=zoom-2;
			traceHex(x,y,tzoom);
			if (zoom > 10) ctx.stroke();
			ctx.fill();
		}
		if (this.highlight != null) {
			ctx.fillStyle=this.highlight[0];
			ctx.strokeStyle=this.highlight[1];
			if (tzoom != zoom-2)
			tzoom=zoom-2;
			traceHex(x,y,tzoom);
			if (zoom > 10) ctx.stroke();
			ctx.fill();
		}
		for (i in this.content) {
				if (this.content[i].progress != null)
					drawProgress(this.content[i].progresschunk/this.content[i].progresschunks,x,y+zoom/200*33,zoom-6,33);
		}
		this.needUpdate=false;
	}
}
function drawProgress(percent,x,y,w,h,colors) {
	if (colors == null) colors=["green","black","white"];
	h*=zoom/200;
	var w1=percent*w;
	var w2=w-w1;
	var x1=x-w/2;
	var x2=x1+w1;
	var x3=x1+w;
	/*ctx.beginPath();
	ctx.moveTo(x1,y);
	ctx.lineTo(x2,y);*/
	//ctx.strokeStyle=colors[0];
	//ctx.stroke();
	/*ctx.beginPath();
	ctx.moveTo(x2,y);
	ctx.lineTo(x3,y);*/
	//ctx.strokeStyle=colors[1];
	//ctx.stroke();
	if (zoom > 20) {ctx.strokeStyle=colors[2];
	ctx.strokeRect(x1,y-h/2,w,h);}
	ctx.fillStyle=colors[1];
	ctx.fillRect(x2,y-h/2,w2,h);
	ctx.fillStyle=colors[0];
	ctx.fillRect(x1,y-h/2,w1,h);

	
}
function traceHex(x,y,tzoom) {
	var points=new Array();
	points.push([x-tzoom/2,y-tzoom/3]);
	points.push([x,y-tzoom/1.5]);
	points.push([x+tzoom/2,y-tzoom/3]);
	points.push([x+tzoom/2,y+tzoom/3]);
	points.push([x,y+tzoom/1.5]);
	points.push([x-tzoom/2,y+tzoom/3]);
	
	points.push(points[0]);
	ctx.beginPath();
	ctx.moveTo(points[0][0],points[0][1]);
	for (var i=1, l = points.length;i < l;i++) {
		ctx.lineTo(points[i][0],points[i][1]);
	}
}
function hexCorner(corner,step) {
	var cur=this;
	if (step != null) for (var i = 0;i < step;i++) {
		cur=cur.nodes[corner];
	}
	else while (cur.nodes[corner] != null) cur=cur.nodes[corner];
	return cur;
}
function generateHexRect(map,width,height) {
	var grid=new Array();
	for (var x = 0;x < width;x++) {
		var t=new Array();
		for (var y = 0;y < height;y++) t.push(new HexNode());
		grid.push(t);
	}
	var eye=0;
	for (var x = 0;x < width;x++) {
		for (var y = 0;y < height;y++) {
			eye++;
			var top=1;
			if (y % 2 == 0) top=0;
			else top=-1;
			
			grid[x][y].id=[x+0.5*top,y];
			var l=null,tl=null,tr=null,r=null,br=null,bl=null;
			if (x > 0)                     l=grid[x-1][y];
			if (y > 0 && x+top >= 0)      tl=grid[x+top][y-1];
			if (y > 0 && x+top+1 < width) tr=grid[x+top+1][y-1];
			if (x+1 < width)                 r=grid[x+1][y];
			if (y+1 < height && x+top+1 < width) br=grid[x+top+1][y+1];
			if (x+top > 0 && y+1 < height) bl=grid[x+top][y+1];
			
			if (l != null) grid[x][y].nodes[0]=l;
			if (tl != null) grid[x][y].nodes[1]=tl;
			if (tr != null) grid[x][y].nodes[2]=tr;
			if (r != null) grid[x][y].nodes[3]=r;
			if (br != null) grid[x][y].nodes[4]=br;
			if (bl != null) grid[x][y].nodes[5]=bl;
			
			//grid[x][y].nodes=[];
			
		}
	}
	for (var x = 0;x < width;x++) {
		for (var y = 0;y < height;y++) {
			nodes.push(grid[x][y]);
		}
	}
}

function getDistance(dir) {
	switch (dir) {
		case 0:return [-1,0];
		case 1:return [-0.5,-1];
		case 2:return [0.5,-1];
		case 3:return [1,0];
		case 4:return [0.5,1];
		case 5:return [-0.5,1];
	}
}
function surroundHexNode(node) {
	//for (var i in cur.nodes) {
	for (var i = 0, l = cur.nodes.length; i < l; i++) {
		if (cur.nodes[i] != null) {
			cur.nodes[i]=new HexNode();
		}
	}
}
var progressBarModule=new Object();
	progressBarModule.act=progressAct;
	progressBarModule.tick=progressTick;
function progressBar(obj) {
	obj.modules.push(progressBarModule);
	obj.progress=null;
	obj.maxprogress=null;
	obj.progresschunk=null;
	obj.progresschunks=null;
}
function progressAct(obj) {
}
function progressTick(obj) {
	if (obj.progress != null) {
		if (obj.progress < obj.maxprogress) {
			obj.progress++;
			newchunk=Math.floor(obj.progress/obj.maxprogress*obj.progresschunks);
			if (obj.progresschunk != newchunk) obj.node.needUpdate=true;
			obj.progresschunk=newchunk;
		}
		if (obj.progress==obj.maxprogress) {
			obj.progressComplete();
			/*obj.node.highlight=[rgba(255,0,0,0.2),"red"];
			obj.progress=null;
			obj.complete=true;*/
			//picked++;
			//dbg("Score: "+picked);
		}
	}
}

//Thing object
function Thing(node,mesh,color) {
	this.node=node;
	this.node.addContent(this);
	this.color=color;
	this.mesh=new Mesh(mesh);
	this.draw=thingDraw;
	this.act=thingAct;
	this.tick=thingTick;
	this.kill=thingKill;
	this.modules=new Array();
	progressBar(this);
	this.progresschunks=6;
	this.animation=Math.floor(Math.random()*6)+1;
	this.progressComplete=thingComplete;
	this.complete=false;
}
function thingAct() {
	//for (i in this.modules) this.modules[i].act(this);
	for (i = 0, l = this.modules.length; i < l; i++) { this.modules[i].act(this); }
	if (this.progress != null) {
			//(animation 0 is nothing)
			if (this.animation==1 || this.animation==2) {
				this.mesh.scale(1-(1/this.maxprogress*realtime));
				this.node.needUpdate=true;
			}else if (this.animation==3) {
				this.mesh.rotateBy(360*(1/this.maxprogress*realtime));
				this.node.needUpdate=true;
			}else if (this.animation==4) {
				this.mesh.scale(1-(1/this.maxprogress*realtime));
				this.mesh.rotateBy(360*(1/this.maxprogress*realtime));
				this.node.needUpdate=true;
			}else if (this.animation==5) {
				this.mesh.rotateBy(-360*(1/this.maxprogress*realtime));
				this.node.needUpdate=true;
			}else if (this.animation==6) {
				this.mesh.scale(1-(1/this.maxprogress*realtime));
				this.mesh.rotateBy(-360*(1/this.maxprogress*realtime));
				this.node.needUpdate=true;
			}
	}
	/*if (Math.random() > 0.99) {
		if (Math.random() > 0.5) {
			var surrounds=new Array();
			for (var i in this.nodes) {
				if (this.nodes[i].content!=null) surrounds.push(this.nodes[i]);
			}
		}
	}*/
}
function thingTick() {
	//for (i in this.modules) this.modules[i].tick(this);
	for (var i = 0, l = this.modules.length;i < l;i++) { this.modules[i].tick(this); }
	if (this.complete) {
		if (this.node.selected) {
			addWorld(randomThing(this.node));
			picked++;
			//dbg("Score: "+picked);
			deSelect(this.node);
			removeWorld(this);
			this.node.highlight=null;
			this.node.needUpdate=true;
		}
	}
	else if (Math.random() > 0.995) {
		this.progress=0;
		this.maxprogress=Math.floor(Math.random()*40)+10;
	}
}
function thingComplete() {
	this.node.highlight=[rgba(255,0,0,0.2),"red"];
	this.progress=null;
	this.complete=true;
}
function thingKill() {
}
function thingDraw() {
	this.mesh.drawToZoom(this.color[0],this.color[1],this.node.pos());
}
function randomThing(node) {
	var gmesh=new Array();
	var meshl=Math.random()*10+5;
	for (var i = 0;i < meshl;i++) {
		gmesh.push([Math.random()*120-60,Math.random()*120-60]);
	}
	gmesh.push(gmesh[0]);
	return new Thing(node,gmesh,[pcolor("random"),pcolor("random")]);
}


//Rectangle object
function Rectangle(sx,sy,sw,sh) {
	this.x=sx;
	this.y=sy;
	this.w=sw;
	this.h=sh;
	this.reset=rectangleReset;
	this.contains=rectangleContains;
	this.collides=rectangleCollide;
	this.containsRect=rectangleContainsRect;
	this.xDist=rectangleXDist;
	this.yDist=rectangleYDist;
	this.draw=rectangleDraw;
	this.undraw=rectangleUndraw;
	this.copy=rectangleCopy;
}
function rectangleXDist(rect) {
	return Math.abs(this.x+this.w/2-rect.x+rect.w/2)-(this.w+rect.w)/2;
}
function rectangleYDist(rect) {
	return Math.abs(this.y+this.h/2-rect.y+rect.h/2)-(this.h+rect.h)/2;
}
function rectangleReset(sx,sy,sw,sh) {
	this.x=sx;
	this.y=sy;
	this.w=sw;
	this.h=sh;
}
function rectangleCollide(rect) {
	if ((this.y+this.h < rect.y) || (this.y > rect.y+rect.h) || (this.x+this.w < rect.x) || (this.x > rect.x+rect.w)) return false;
	return true;
}
function rectangleContains(x,y) {
	if ((x > this.x) && (x < this.x+this.w) && (y > this.y) && (y < this.y+this.h)) return true;
	return false;
}
function rectangleContainsRect(rect) {
	if ((rect.x < this.x) && (rect.x+rect.w > this.x+this.w) && (rect.y < this.y) && (rect.y+rect.h > this.y+this.h)) return true;
	return false;
}
function rectangleDraw() {
	ctx.fillRect(this.x,this.y,this.w,this.h);
}
function rectangleUndraw() {
	ctx.clearRect(this.x,this.y,this.w,this.h);
}
function rectangleCopy() {
	return new Rectangle(this.x,this.y,this.w,this.h);
}
function drawIt() {
	this.mesh.draw(this.color[0],this.color[1]);
}
//Line object
function Line(x1,y1,x2,y2) {
	this.x1=x1;
	this.y1=y1;
	this.x2=x2;
	this.y2=y2;
}

//Mesh object
function Mesh(distarray,vectFacing,x,y) {
	this.points=distarray;
	this.mesh=new Array(distarray);
	this.pos=[x,y];
	if (x==null) this.pos=[0,0];
	this.facingy=vectFacing;
	if (vectFacing == null) this.facingy=newVectorDL(270,1);
	this.facingx=newVectorDL((this.facingy.direction+90)%360,1);
	this.rectangle=new Rectangle(0,0,0,0);
	this.draw=meshDraw;
	this.drawToZoom=meshDrawToZoom;
	this.drawClear=meshDrawClear;
	this.undraw=meshUndraw;
	this.update=meshUpdate;
	this.move=meshMove;
	this.rotate=meshRotate;
	this.rotateBy=meshRotateBy;
	this.scale=meshScale;
	this.contains=meshContains;
	this.collides=meshCollides;
	this.realMesh=meshRealMesh;
	this.skips=new Array();
	this.glow=meshGlow;
	this.update();
	this.copy=meshCopy;
	this.lineize=meshLineize;
}
function meshMove(x,y) {
	var dx=x-this.pos[0];
	var dy=y-this.pos[1];
	this.pos=[x,y];
	this.rectangle.x+=dx;
	this.rectangle.y+=dy;
}
function meshRotate(rotation) {
	if (rotation.direction != this.facingy.direction) {
		this.facingy=newVectorDL((rotation.direction)%360,1);
		//this.facingx=newVectorDL((rotation.direction+90)%360,1);
		this.update();
	}
}
function meshRotateBy(by) {
	if (by != 0) {
		this.facingy=newVectorDL((this.facingy.direction+by)%360,1);
		//this.facingx=newVectorDL((rotation.direction+90)%360,1);
		this.update();
	}
}
function rotateMesh(mesh,rotation) {
	if (rotation != mesh.facingy.direction) {
		mesh.facingy=newVectorDL((rotation)%360,1);
		//this.facingx=newVectorDL((rotation.direction+90)%360,1);
		mesh.update();
	}
}
function meshUpdate() {
	this.facingx.setLength(1);
	this.facingy.setLength(1);
	var x=this.pos[0];
	var mx=this.pos[0];
	var y=this.pos[1];
	var my=this.pos[1];
	var coord=[0,0];
	var coss = Math.cos(toRadians(this.facingy.direction-90));
	var sinn = Math.sin(toRadians(this.facingy.direction-90));
	//for (var i in this.points) {
	for (var i = 0, l = this.points.length;i < l;i++) {
		var coord=[this.pos[0]+this.points[i][0]*coss - this.points[i][1]*sinn,
		           this.pos[1]+this.points[i][1]*coss + this.points[i][0]*sinn]
		if (coord[0] < x) x=coord[0];
		if (coord[0] > mx) mx=coord[0];
		if (coord[1] < y) y=coord[1];
		if (coord[1] > my) my=coord[1];
		this.mesh[i]=[coord[0]-this.pos[0],coord[1]-this.pos[1]];
	}
	this.rectangle.reset(Math.floor(x)-1,Math.floor(y)-1,Math.ceil(mx-x)+3,Math.ceil(my-y)+3);
}
function meshContains(x,y) {
	if (this.rectangle.contains(x,y)) {
		var tmesh=new Array();
		//for (var i=0;i < this.mesh.length;i++) {
		for (var i = 0, l = this.mesh.length;i < l;i++) {
			tmesh[i]=[this.mesh[i][0]+this.pos[0],this.mesh[i][1]+this.pos[1]];
		}
		if (polyContains(tmesh,x,y)) {return true;}
	}
	return false;
}
function meshCollides(mesh2) {
	if (this.rectangle.collides(mesh2.rectangle)) {
		var tmesh=new Array();
		var tmesh2=new Array();
		//for (var i=0;i < this.mesh.length;i++) {
		for (var i = 0, l = this.mesh.length;i < l;i++) {
			tmesh[i]=[this.mesh[i][0]+this.pos[0],this.mesh[i][1]+this.pos[1]];
		}
		//for (var i=0;i < mesh2.mesh.length;i++) {
		for (var i = 0, l = mesh2.mesh.length;i < l;i++) {
			tmesh2[i]=[mesh2.mesh[i][0]+mesh2.pos[0],mesh2.mesh[i][1]+mesh2.pos[1]];
		}
		if (polyCollides(tmesh,tmesh2)) {
			return true;
		}
	}
	return false;
}
function meshScale(ratio) {
	//for (var i in this.points) {
	for (var i = 0, l = this.points.length;i < l;i++) {
		this.points[i][0]*=ratio;
		this.points[i][1]*=ratio;
	}
	this.update();
}
function meshDraw(strokeStyle,fillStyle,pos) {
	if (pos != null) this.pos=pos;
	ctx.beginPath();
	ctx.moveTo(this.mesh[0][0]+this.pos[0],this.mesh[0][1]+this.pos[1],3,3);
	//for (var i in this.mesh) {
	for (var i = 0, l = this.mesh.length;i < l;i++) {
		ctx.lineTo(this.mesh[i][0]+this.pos[0],this.mesh[i][1]+this.pos[1],3,3);
	}
	if (fillStyle!="") {
		ctx.fillStyle=fillStyle;
		ctx.fill();
	}
	if (strokeStyle!="") {
		ctx.strokeStyle=strokeStyle;
		ctx.stroke();
	}
}
function meshDrawToZoom(strokeStyle,fillStyle,pos) { //lol copypaste
	var mesh=copyMesh(this.mesh);
	//for (var i in mesh) {
	for (var i = 0, l = mesh.length;i < l;i++) {
		mesh[i][0]*=zoom/200;
		mesh[i][1]*=zoom/200;
	}
	if (pos != null) this.pos=pos;
	ctx.beginPath();
	ctx.moveTo(mesh[0][0]+this.pos[0],mesh[0][1]+this.pos[1],3,3);
	//for (var i in mesh) {
	for (var i = 0, l = mesh.length;i < l;i++) {
		ctx.lineTo(mesh[i][0]+this.pos[0],mesh[i][1]+this.pos[1],3,3);
	}
	if (fillStyle!="") {
		ctx.fillStyle=fillStyle;
		ctx.fill();
	}
	if (strokeStyle!="") {
		ctx.strokeStyle=strokeStyle;
		ctx.stroke();
	}
}
function meshDrawClear(strokeStyle,fillStyle) {
	ctx.beginPath();
	ctx.moveTo(this.mesh[0][0]+this.pos[0],this.mesh[0][1]+this.pos[1],3,3);
	//for (var i in this.mesh) {
	for (var i = 0, l = this.mesh.length;i < l;i++) {
		if (this.skips[i]==false) ctx.lineTo(this.mesh[i][0]+this.pos[0],this.mesh[i][1]+this.pos[1],3,3);
		else ctx.moveTo(this.mesh[i][0]+this.pos[0],this.mesh[i][1]+this.pos[1],3,3);
	}
	if (fillStyle!="") {
		ctx.fillStyle=fillStyle;
		ctx.fill();
	}
	if (strokeStyle!="") {
		ctx.strokeStyle=strokeStyle;
		ctx.stroke();
	}
}
function meshUndraw() {
	ctx.clearRect(this.rectangle.x,this.rectangle.y,this.rectangle.w,this.rectangle.h);
}
function meshRealMesh() {
	var tmesh=new Array();
	//for (var i in this.mesh) tmesh[i]=[[this.mesh[i][0]+this.pos[0]],[this.mesh[i][1]+this.pos[1]]];
	for (var i = 0, l = this.mesh.length;i < l;i++) { tmesh[i]=[[this.mesh[i][0]+this.pos[0]],[this.mesh[i][1]+this.pos[1]]]; }
	return tmesh;
}
function meshGlow(size,step,color,start) { //color is [r,g,b]
	var glow=1;
	if (start == null) start=1;
	var tmesh=this.copy();
	var sw=tmesh.rectangle.w;
	while (tmesh.rectangle.w-sw<size) {
		tmesh.scale(step);
		glow=start-((tmesh.rectangle.w-sw)/size)*start;
		tmesh.draw("rgba("+color[0]+","+color[1]+","+color[2]+","+glow+")","");
	}
	undraws.push(tmesh.rectangle);
}
function meshLineize() {
	var lines=new Array();
	var len=this.points.length;
	for (var i=1;i < len;i++) {
		lines.push(new Mesh(copyMesh([this.points[i-1],this.points[i]]),this.facingy.copy(),this.pos[0],this.pos[1]));
	}
	return lines;
}
function meshCopy() {
	var newMesh=new Mesh(copyMesh(this.points),this.facingy.copy(),this.pos[0],this.pos[1]);
	newMesh.skips=copyArray(this.skips);
	newMesh.update();
	return newMesh;
}
function copyMesh(meshArray) {
	var nmesh=new Array();
	//for (var i in meshArray) nmesh.push([meshArray[i][0],meshArray[i][1]]);
	for (var i = 0, l = meshArray.length;i < l;i++) { nmesh.push([meshArray[i][0],meshArray[i][1]]); }
	return nmesh;
}
function copyArray(array) {
	var nray=new Array();
	//for (var i in array) nray.push(array[i]);
	for (var i = 0, l = array.length;i < l;i++) { nray.push(array[i]); }
	return nray;
}
function explodeMesh(character,myrgb) {
	meshes=character.mesh.lineize();
	//miscJunk.push(new Enemy(50),[[10,0],[5,10]]);
	var rgb=[233,0,0];
	if (myrgb != null) rgb=myrgb;
	//for (i in meshes) {
	for (var i = 0, l = meshes.length;i < l;i++) {
		mot=character.motion.copy();
		mot.setDirection(mot.direction+=Math.random()*40-20);
		mot.scale(Math.random()*0.8+0.8);
		miscJunk.push(new Debris(character.xc,character.yc,mot,meshes[i],character.mesh.facingy.direction,rgb));
	}
}
function findPos(obj) { //http://www.quirksmode.org/js/findpos.html thanks for awesome script
	var curleft = curtop = 0;
	if (obj.offsetParent) {
		do {
			curleft += obj.offsetLeft;
			curtop += obj.offsetTop;
		} while (obj = obj.offsetParent);
	}
	return [curleft,curtop];
}
function cancelEvent(e) { //http://www.switchonthecode.com/tutorials/javascript-tutorial-the-scroll-wheel thanks and I hope I can use this here
  e = e ? e : window.event;
  if(e.stopPropagation)
    e.stopPropagation();
  if(e.preventDefault)
    e.preventDefault();
  e.cancelBubble = true;
  e.cancel = true;
  e.returnValue = false;
  return false;
}
function Fpstracker(print) {
	function fpsrun() {
		if (this.frames.length > this.framenum-1) this.frames.splice(0, 1);
		var currTime = Date.now();
		this.frames.push(currTime);
		if (this.count++ % this.framenum == 0) {
			var frameRateText = 1000 / ((currTime - this.frames[0]) / (this.frames.length - 1)) + "";
			frameRateText = frameRateText.replace(this.decimals, "");
			this.print(frameRateText);
		}
	}
	function fpslast() {
		return this.frames[this.frames.length-1]-this.frames[this.frames.length-2];
	}
	this.frames=new Array();
	this.frames.push(Date.now());
	this.count=0;
	this.framenum=30;
	this.run=fpsrun;
	this.print=print;
	this.last=fpslast;
	this.decimalplaces=0;
	//this.decimals=/(^[^.]+\...).*/;
	this.decimals=/\..*/;
}
function rgba(r,g,b,a) {
	if (a == null) return "rgb("+Math.floor(r)+","+Math.floor(g)+","+Math.floor(b)+")";
	return "rgba("+Math.floor(r)+","+Math.floor(g)+","+Math.floor(b)+","+a+")";
}
function pcolor(name) {
	if (name == "random") return rgba(Math.random()*255,Math.random()*255,Math.random()*255);
	else if (name == "randoma") return rgba(Math.random()*255,Math.random()*255,Math.random()*255,Math.random()*255);
}
Array.remove = function(array, from, to) {
	var rest = array.slice((to || from) + 1 || array.length);
	array.length = from < 0 ? array.length + from : from;
	return array.push.apply(array, rest);
};
Array.removeItem = function(array, item) {
	//for (var i in array) {
	for (var i = 0, l = array.length;i < l;i++) {
		if (array[i] == item) {array.splice(i,1);break;}
	}
};
Array.findItem = function(array, item) {
	//for (var i in array) {
	for (var i = 0, l = array.length;i < l;i++) {
		if (array[i] == item) {return i;}
	}
	return -1;
};
Array.findById = function(array, item) {
	//for (var i in array) {
	for (var i = 0, l = array.length;i < l;i++) {
		if (array[i].id+""==item+"") {return i;}
	}
	return -1;
};
Array.findByNode = function(array, node) {
	//for (var i in array) {
	for (var i = 0, l = array.length;i < l;i++) {
		if (array[i].n == node) {return i;}
	}
	return -1;
};
Array.findByName = function(array, name) {
	//for (var i in array) {
	for (var i = 0, l = array.length;i < l;i++) {
		if ((array[i] != null) && (array[i].name == name)) {return i;}
	}
	return -1;
};
function dbg(t){$("debug").innerHTML=t;}
function dbgp(t){$("debug").innerHTML+=t;}
function $(id) {return document.getElementById(id);}