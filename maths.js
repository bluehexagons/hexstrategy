function distance(x1,y1,x2,y2) {
	return Math.sqrt(Math.pow(x1-x2,2)+Math.pow(y1-y2,2));
}
function segInt(p1,p2,p3,p4) {
	return segIntersection(p1[0],p1[1],p2[0],p2[1],p3[0],p3[1],p4[0],p4[1]);
}
function pathCollisions(path,mesh) {
	var tmesh=new Array();
	//for (var i in mesh.mesh) {
	for (var i = 0, l = mesh.mesh.length;i < l;i++) {
		tmesh[i]=[mesh.mesh[i][0]+mesh.pos[0],mesh.mesh[i][1]+mesh.pos[1]];
	}
	var collisions=new Array();
	//for (var i=0;i < tmesh.length - 1;i++) {
	for (var i = 0, l = tmesh.length - 1;i < l;i++) {
		var cur=segIntersection(path[0][0],path[0][1],path[1][0],path[1][1],tmesh[i][0],tmesh[i][1],tmesh[i+1][0],tmesh[i+1][1]);
		if (cur != null) collisions.push(cur);
	}
	if (collisions[0] != null) return collisions;
	return null;
}
/**
Originally coded in Java by Ryan Alexander
*/
// Line Segment Intersection

function segIntersection(x1, y1, x2, y2, x3, y3, x4, y4) 
{ 
  var bx = x2 - x1; 
  var by = y2 - y1; 
  var dx = x4 - x3; 
  var dy = y4 - y3;
  var b_dot_d_perp = bx * dy - by * dx;
  if(b_dot_d_perp == 0) {
    return null;
  }
  var cx = x3 - x1;
  var cy = y3 - y1;
  var t = (cx * dy - cy * dx) / b_dot_d_perp;
  if(t < 0 || t > 1) {
    return null;
  }
  var u = (cx * by - cy * bx) / b_dot_d_perp;
  if(u < 0 || u > 1) { 
    return null;
  }
  return [x1+t*bx, y1+t*by];
}

function polyContains(poly,x,y) {
	var farleft=poly[0][0];
	var fartop=poly[0][1];
	//for (var i=1;i < poly.length;i++) {
	for (var i = 1, l = poly.length;i < l;i++) {
		if (poly[i][0] < farleft) farleft=poly[i][0];
		if (poly[i][1] < fartop) fartop=poly[i][1];
	}
	var col=0;
	for (var i = 0, l = poly.length - 1;i < l;i++) {
		if (segIntersection(farleft,fartop,x,y, poly[i][0],poly[i][1],poly[i+1][0],poly[i+1][1]) != null) col++;
	}
	if (col%2==0) return false;
	return true;
}

function polyCollides(poly,poly2) {
	//for (var i=0;i<poly.length-1;i++) {
	for (var i = 0, l = poly.length - 1;i < l;i++) {
		//for (var i2=0;i2<poly2.length-1;i2++) {
		for (var i2 = 0, l2 = poly2.length - 1;i2 < l2;i2++) {
			if (segIntersection(poly[i][0],poly[i][1],poly[i+1][0],poly[i+1][1],poly2[i2][0],poly2[i2][1],poly2[i2+1][0],poly2[i2+1][1]) != null) return true;
		}
	}
	if (polyContains(poly2,poly[0][0],poly[0][1])) return true;
	if (polyContains(poly,poly2[0][0],poly2[0][1])) return true;
	return false;
}
/**
Originally coded in Java by Ryan Alexander
*/
// Infinite Line Intersection
function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4)
{
  var bx = x2 - x1;
  var by = y2 - y1;
  var dx = x4 - x3;
  var dy = y4 - y3; 
  var b_dot_d_perp = bx*dy - by*dx;
  if(b_dot_d_perp == 0) {
    return null;
  }
  var cx = x3-x1; 
  var cy = y3-y1;
  var t = (cx*dy - cy*dx) / b_dot_d_perp; 
 
  return [x1+t*bx, y1+t*by]; 
}



function a_star(start, destination, board, columns, rows) //http://stormhorse.com/a_star.js
{
	//Create start and destination as true nodes
	start = new node(start[0], start[1], -1, -1, -1, -1);
	destination = new node(destination[0], destination[1], -1, -1, -1, -1);

	var open = []; //List of open nodes (nodes to be inspected)
	var closed = []; //List of closed nodes (nodes we've already inspected)

	var g = 0; //Cost from start to current node
	var h = heuristic(start, destination); //Cost from current node to destination
	var f = g+h; //Cost from start to destination going through the current node

	//Push the start node onto the list of open nodes
	open.push(start); 

	//Keep going while there's nodes in our open list
	while (open.length > 0)
	{
		//Find the best open node (lowest f value)

		//Alternately, you could simply keep the open list sorted by f value lowest to highest,
		//in which case you always use the first node
		var best_cost = open[0].f;
		var best_node = 0;

		//for (var i = 1; i < open.length; i++)
		for (var i = 1, l = open.length; i < l; i++)
		{
			if (open[i].f < best_cost)
			{
				best_cost = open[i].f;
				best_node = i;
			}
		}

		//Set it as our current node
		var current_node = open[best_node];

		//Check if we've reached our destination
		if (current_node.x == destination.x && current_node.y == destination.y)
		{
			var path = [destination]; //Initialize the path with the destination node

			//Go up the chain to recreate the path 
			while (current_node.parent_index != -1)
			{
				current_node = closed[current_node.parent_index];
				path.unshift(current_node);
			}

			return path;
		}

		//Remove the current node from our open list
		open.splice(best_node, 1);

		//Push it onto the closed list
		closed.push(current_node);

		//Expand our current node (look in all 8 directions)
		for (var new_node_x = Math.max(0, current_node.x-1); new_node_x <= Math.min(columns-1, current_node.x+1); new_node_x++)
			for (var new_node_y = Math.max(0, current_node.y-1); new_node_y <= Math.min(rows-1, current_node.y+1); new_node_y++)
			{
				if (board[new_node_x][new_node_y] == 0 //If the new node is open
					|| (destination.x == new_node_x && destination.y == new_node_y)) //or the new node is our destination
				{
					//See if the node is already in our closed list. If so, skip it.
					var found_in_closed = false;
					for (var i in closed)
						if (closed[i].x == new_node_x && closed[i].y == new_node_y)
						{
							found_in_closed = true;
							break;
						}

					if (found_in_closed)
						continue;

					//See if the node is in our open list. If not, use it.
					var found_in_open = false;
					for (var i in open)
						if (open[i].x == new_node_x && open[i].y == new_node_y)
						{
							found_in_open = true;
							break;
						}

					if (!found_in_open)
					{
						var new_node = new node(new_node_x, new_node_y, closed.length-1, -1, -1, -1);

						new_node.g = current_node.g + Math.floor(Math.sqrt(Math.pow(new_node.x-current_node.x, 2)+Math.pow(new_node.y-current_node.y, 2)));
						new_node.h = heuristic(new_node, destination);
						new_node.f = new_node.g+new_node.h;

						open.push(new_node);
					}
				}
			}
	}

	return [];
}

//An A* heurisitic must be admissible, meaning it must never overestimate the distance to the goal.
//In other words, it must either underestimate or return exactly the distance to the goal.
function heuristic(current_node, destination)
{
	//Find the straight-line distance between the current node and the destination.
	return Math.floor(Math.sqrt(Math.pow(current_node.x-destination.x, 2)+Math.pow(current_node.y-destination.y, 2)));
}


/* Each node will have six values: 
 X position
 Y position
 Index of the node's parent in the closed array
 Cost from start to current node
 Heuristic cost from current node to destination
 Cost from start to destination going through the current node
*/	

function node(x, y, parent_index, g, h, f)
{
	this.x = x;
	this.y = y;
	this.parent_index = parent_index;
	this.g = g;
	this.h = h;
	this.g = f;
}