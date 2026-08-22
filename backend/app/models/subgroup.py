from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Subgroup(Base):
    """A named, reusable subset of a training group's athletes.

    A selection convenience: when a coach targets a group workout or plan, they
    can pick a subgroup instead of ticking individuals. Subgroups are shared
    among all the group's coaches. Overlapping (an athlete may be in several).
    """
    __tablename__ = "subgroups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    training_group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class SubgroupMember(Base):
    """Join row: an athlete belongs to a subgroup. Cleaned up when the athlete
    leaves the group (see coach._purge_athlete_from_group_subgroups); cascades
    on subgroup deletion and athlete-account deletion."""
    __tablename__ = "subgroup_members"
    __table_args__ = (
        UniqueConstraint("subgroup_id", "athlete_id", name="uq_subgroup_member"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    subgroup_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("subgroups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    athlete_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
