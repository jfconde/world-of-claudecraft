import type { SimContext } from '../sim_context';
import type { AbilityDef, Entity } from '../types';
import { angleTo, dist2d, MELEE_RANGE, normAngle } from '../types';

const AUTO_FOCUS_HOSTILE_RANGE = 40;
const AUTO_FOCUS_REAR_ALLOWANCE = 4;

function autoFocusRange(ability: AbilityDef): number {
  const baseRange = ability.range > 0 ? ability.range : MELEE_RANGE;
  return Math.min(baseRange, AUTO_FOCUS_HOSTILE_RANGE);
}

function isHostileCandidate(ctx: SimContext, caster: Entity, target: Entity): boolean {
  if (target.id === caster.id || target.dead) return false;
  if (ctx.isHostileTo(caster, target)) return true;
  if (target.kind !== 'mob' || target.ownerId === null) return false;
  const owner = ctx.entities.get(target.ownerId);
  return owner !== undefined && ctx.isHostileTo(caster, owner);
}

function hostileFacingAllowsTarget(caster: Entity, target: Entity, distance: number): boolean {
  if (distance <= AUTO_FOCUS_REAR_ALLOWANCE) return true;
  const facingDiff = Math.abs(normAngle(angleTo(caster.pos, target.pos) - caster.facing));
  return facingDiff <= Math.PI / 2;
}

function nearestHostileTarget(ctx: SimContext, caster: Entity, maxRange: number): Entity | null {
  let engaged: { entity: Entity; distance: number } | null = null;
  let nearest: { entity: Entity; distance: number } | null = null;
  ctx.grid.forEachInRadius(caster.pos.x, caster.pos.z, maxRange, (entity) => {
    if (!isHostileCandidate(ctx, caster, entity)) return;
    const distance = dist2d(caster.pos, entity.pos);
    if (distance > maxRange) return;
    if (!hostileFacingAllowsTarget(caster, entity, distance)) return;
    const candidate = { entity, distance };
    if (entity.aggroTargetId === caster.id || entity.targetId === caster.id) {
      if (engaged === null || distance < engaged.distance) engaged = candidate;
      return;
    }
    if (nearest === null || distance < nearest.distance) nearest = candidate;
  });
  return engaged?.entity ?? nearest?.entity ?? null;
}

export function resolveAutoFocusHostileTarget(
  ctx: SimContext,
  caster: Entity,
  maxRange = AUTO_FOCUS_HOSTILE_RANGE,
): Entity | null {
  return nearestHostileTarget(ctx, caster, maxRange);
}

function nearestPartyFriendlyTarget(
  ctx: SimContext,
  caster: Entity,
  ability: AbilityDef,
): Entity | null {
  const party = ctx.partyOf(caster.id);
  if (!party) return null;
  const maxRange = autoFocusRange(ability);
  let nearest: { entity: Entity; distance: number } | null = null;
  ctx.grid.forEachInRadius(caster.pos.x, caster.pos.z, maxRange, (entity) => {
    if (entity.kind !== 'player' || entity.id === caster.id || entity.dead) return;
    if (!ctx.isFriendlyTo(caster, entity)) return;
    if (ctx.partyOf(entity.id)?.id !== party.id) return;
    const distance = dist2d(caster.pos, entity.pos);
    if (distance > maxRange) return;
    if (nearest === null || distance < nearest.distance) nearest = { entity, distance };
  });
  return nearest?.entity ?? null;
}

export function resolveAutoFocusTarget(
  ctx: SimContext,
  caster: Entity,
  ability: AbilityDef,
): Entity | null {
  if (!ability.requiresTarget) return null;
  if (ability.targetType === 'friendly') return nearestPartyFriendlyTarget(ctx, caster, ability);
  if (ability.targetType === 'any') {
    return (
      nearestHostileTarget(ctx, caster, AUTO_FOCUS_HOSTILE_RANGE) ??
      nearestPartyFriendlyTarget(ctx, caster, ability)
    );
  }
  return nearestHostileTarget(ctx, caster, AUTO_FOCUS_HOSTILE_RANGE);
}