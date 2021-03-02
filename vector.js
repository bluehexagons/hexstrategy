function toRadians(degrees) {
 return degrees*(Math.PI/180);
}
function toDegrees(radians) {
 return radians*(180/Math.PI);
}
function newVector() {
 return new Vector();
}
function newVectorDL(direction,length) {
 var temp = new Vector();
 temp.setNew(direction,length);
 return temp;
}
function newVectorDist(xDist,yDist) {
 var temp=new Vector();
 temp.setDistance(xDist,yDist);
 return temp;
}
function newVectorCoords(x1,y1,x2,y2) {
 var temp=new Vector();
 temp.setCoords(x1,y1,x2,y2);
 return temp;
}
function Vector() {
 this.dx=0;
 this.dy=0;
 this.direction=0;
 this.length=0;
 this.setNew=vectorSetNew;
 this.setCoords=vectorSetCoords;
 this.setDistance=vectorSetDist;
 this.setDirection=vectorSetDirection;
 this.add=vectorAdd;
 this.subtract=vectorSubtract;
 this.reduceLength=vectorReduceLength;
 this.scale=vectorScale;
 this.setNeutral=vectorSetNeutral;
 this.updatePolar=vectorUpdatePolar;
 this.updateCartesian=vectorUpdateCartesian;
 this.copy=vectorCopy;
 this.setX=vectorSetX;
 this.setY=vectorSetY;
 this.setDirection=vectorSetDirection;
 this.setLength=vectorSetLength;
 this.toLine=vectorToLine;
}
function vectorToLine(x,y) {
 return new Line(x,y,x+dx,y+dy);
}
function vectorSetX(x) {
 this.dx=x;
 this.updatePolar();
}
function vectorSetY(y) {
 this.dy=y;
 this.updatePolar();
}
function vectorSetLength(dist) {
 this.length=dist;
 this.updateCartesian();
}
function vectorSetNew(direction,length) {
 this.length = length;
 this.direction = direction;
 this.updateCartesian();
}
function vectorSetCoords(x1,y1,x2,y2) {
 this.dx = x2-x1;
 this.dy = y2-y1;
 this.updatePolar();
}
function vectorSetDist(xDist,yDist) {
 this.dx = xDist;
 this.dy = yDist;
}
function vectorSetDirection(direction) {
 this.direction = direction;
 this.updateCartesian();
}
//other must be a vector in these:
function vectorAdd(other) {
 this.dx += other.dx;
 this.dy += other.dy;
 this.updatePolar();
}
function vectorSubtract(other) {
 this.dx -= other.dx;
 this.dy -= other.dy;
 this.updatePolar();
}
function vectorReduceLength(by) {
 this.length = this.length - by;
 this.updateCartesian();
}
function vectorScale(factor) {
 this.length = this.length * factor;
 this.updateCartesian();
}
function vectorSetNeutral() {
 this.dx = 0.0;
 this.dy = 0.0;
 this.length = 0.0;
 this.direction = 0;
}

    /**
     * Update the direction and length fom the current dx, dy.
     */
function vectorUpdatePolar() {
 this.direction = toDegrees(Math.atan2(this.dy, this.dx));
 this.length = Math.sqrt(this.dx*this.dx+this.dy*this.dy);
}

    /**
     * Update dx and dy from the current direction and length.
     */
function vectorUpdateCartesian() {
 this.dx = this.length * Math.cos(toRadians(this.direction));
 this.dy = this.length * Math.sin(toRadians(this.direction));
}

    /*public double getX() {
        return dx;
    }

    public double getY() {
        return  dy;
    }

    public double getDirection() {
        return direction;
    }

    public double getLength() {
        return length;
    }*/

    /**
     * Create a copy of this vector.
     */
function vectorCopy() {
 var copy = new Vector();
 copy.dx = this.dx;
 copy.dy = this.dy;
 copy.direction = this.direction;
 copy.length = this.length;
 return copy;
}
function vectorToString() {
 return "[" + this.direction + " " + this.length + " / " + this.dx + "," + this.dy + "]";
}