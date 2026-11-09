"""Editing groups of equivalent tags (decisions 13 and 14 of the data source
spec): what a change to a tag's equivalents means, the questions it raises,
applying it, and keeping every group at two tags or more.

A group's rule is kept on its tags, all equal; the group has none of its own.
No FastAPI here: `server/api/tags.py` calls these with a session.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from . import models


class MoveTag(BaseModel):
    """`tag_id` is in another group now; joining moves it out of that group,
    which keeps `from_tag_ids` (its other members, in id order)."""

    type: Literal["move_tag"] = "move_tag"
    tag_id: int
    from_tag_ids: list[int]


class SwitchRule(BaseModel):
    """`tag_id`, with `tag_rule`, would join a group of `group_rule`: its rule
    would switch."""

    type: Literal["switch_rule"] = "switch_rule"
    tag_id: int
    tag_rule: str
    group_rule: str


class ChangeRule(BaseModel):
    """The rule of `tag_ids` (the tag and every member that stays, in id
    order) would all change to `rule`."""

    type: Literal["change_rule"] = "change_rule"
    tag_ids: list[int]
    rule: str


Question = MoveTag | SwitchRule | ChangeRule


@dataclass(frozen=True)
class Change:
    """What a request does to the tag's group. `leaving` are the tags taken out
    of it, `joining` those put in (the tag in `derive`'s rule), `staying`
    the tag's other members that remain."""

    derive: str
    leaving: list[models.Tag]
    joining: list[models.Tag]
    staying: list[models.Tag]


def _members(db: Session, group_id: int) -> list[models.Tag]:
    return list(db.scalars(select(models.Tag).where(models.Tag.group_id == group_id).order_by(models.Tag.id)))


def plan_change(
    db: Session, tag: models.Tag, derive: str, equivalent: Sequence[models.Tag] | None
) -> tuple[Change, list[Question]]:
    """The change `equivalent` (the complete list of the tag's other members as
    wanted, None to leave the group alone) makes, and the questions it
    raises, in the order moves, switches, rule change. Reads only."""
    current = [t for t in _members(db, tag.group_id) if t is not tag] if tag.group_id is not None else []
    wanted = current if equivalent is None else list(equivalent)
    wanted_ids = {t.id for t in wanted}
    current_ids = {t.id for t in current}
    leaving = [t for t in current if t.id not in wanted_ids]
    staying = [t for t in current if t.id in wanted_ids]
    joining = [t for t in wanted if t.id not in current_ids]
    questions: list[Question] = [
        MoveTag(
            tag_id=t.id,
            from_tag_ids=[m.id for m in _members(db, t.group_id) if m.id != t.id],
        )
        for t in joining
        if t.group_id is not None
    ]
    questions += [
        SwitchRule(tag_id=t.id, tag_rule=t.derive, group_rule=derive) for t in joining if t.derive != derive
    ]
    if derive != tag.derive and staying:
        ids = sorted([tag.id, *(t.id for t in staying)])
        questions.append(ChangeRule(tag_ids=ids, rule=derive))
    return Change(derive, leaving, joining, staying), questions


def apply_change(db: Session, tag: models.Tag, change: Change) -> None:
    """Take the leaving tags out, put the joining ones in (a group is made if
    the tag has none), give every member the rule, then drop the groups left
    with fewer than two tags."""
    for leaver in change.leaving:
        leaver.group_id = None
    if change.joining and tag.group_id is None:
        group = models.TagGroup()
        db.add(group)
        db.flush()
        tag.group_id = group.id
    for member in [tag, *change.staying, *change.joining]:
        member.derive = change.derive
        member.group_id = tag.group_id
    db.flush()
    dissolve_small_groups(db)


def leave_group(db: Session, tag: models.Tag) -> None:
    """Take the tag out of its group, for deleting it; the others stay
    equivalent unless one is left."""
    tag.group_id = None
    db.flush()
    dissolve_small_groups(db)


def dissolve_small_groups(db: Session) -> None:
    """Delete every group with fewer than two members, freeing a lone one."""
    sizes = dict(
        db.execute(
            select(models.Tag.group_id, func.count()).where(models.Tag.group_id.is_not(None)).group_by(models.Tag.group_id)
        ).all()
    )
    small = [g for g in db.scalars(select(models.TagGroup.id)) if sizes.get(g, 0) < 2]
    if not small:
        return
    for lone in db.scalars(select(models.Tag).where(models.Tag.group_id.in_(small))):
        lone.group_id = None
    db.flush()
    db.execute(delete(models.TagGroup).where(models.TagGroup.id.in_(small)))


def members(db: Session) -> dict[int, list[int]]:
    """Each group's member ids in id order, by group id."""
    result: dict[int, list[int]] = {}
    rows = db.execute(
        select(models.Tag.group_id, models.Tag.id).where(models.Tag.group_id.is_not(None)).order_by(models.Tag.id)
    )
    for group_id, tag_id in rows:
        result.setdefault(group_id, []).append(tag_id)
    return result
