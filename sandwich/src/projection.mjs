import * as CANNON from 'cannon-es';

// Cannon decides whether two shapes touch by projecting both onto a series of
// axes. For each one it rebuilds the shape's local origin and visits every
// vertex, although the pose is the same for all of a pair's axes and a box's
// furthest corner is known from the signs of the axis. A slice is 25 boxes, so
// box against box is most of the collision work in a stack.
//
// project() takes both shortcuts for boxes. It runs the same arithmetic as
// Cannon in the same order, so the extents it returns are identical.
export const cannonProject = CANNON.ConvexPolyhedron.project;

const zero = new CANNON.Vec3(),
  localAxis = new CANNON.Vec3();
// One remembered pose for each shape of the pair being tested.
const poses = [0, 1].map(() => ({
  position: new CANNON.Vec3(NaN),
  quaternion: new CANNON.Quaternion(),
  origin: new CANNON.Vec3(),
}));
let stale = 0;

function localOrigin(position, quaternion) {
  for (const pose of poses)
    if (
      pose.position.x === position.x &&
      pose.position.y === position.y &&
      pose.position.z === position.z &&
      pose.quaternion.x === quaternion.x &&
      pose.quaternion.y === quaternion.y &&
      pose.quaternion.z === quaternion.z &&
      pose.quaternion.w === quaternion.w
    )
      return pose.origin;
  const pose = poses[(stale ^= 1)];
  pose.position.copy(position);
  pose.quaternion.copy(quaternion);
  return CANNON.Transform.pointToLocalFrame(position, quaternion, zero, pose.origin);
}

// A box's corners are every sign of its half extents, in Cannon's own order.
const corners = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
function halfExtents({ vertices }) {
  if (vertices.length !== 8) return null;
  const half = vertices[6];
  return vertices.every(
    (v, i) =>
      v.x === corners[i * 3] * half.x &&
      v.y === corners[i * 3 + 1] * half.y &&
      v.z === corners[i * 3 + 2] * half.z,
  )
    ? half
    : null;
}

export function project(shape, axis, position, quaternion, result) {
  if (shape.half === undefined) shape.half = halfExtents(shape);
  if (!shape.half) return cannonProject(shape, axis, position, quaternion, result);
  CANNON.Transform.vectorToLocalFrame(position, quaternion, axis, localAxis);
  const offset = localOrigin(position, quaternion).dot(localAxis);
  const { x, y, z } = shape.half;
  // The furthest corner is the one whose signs match the axis; the nearest is
  // its opposite.
  const reach = x * Math.abs(localAxis.x) + y * Math.abs(localAxis.y) + z * Math.abs(localAxis.z);
  result[0] = reach - offset;
  result[1] = -reach - offset;
}
