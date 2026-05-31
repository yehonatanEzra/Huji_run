from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.health_wellness import HealthProfessional, HealthReview
from ..schemas.health_wellness import (
    ProfessionalCreate, ProfessionalUpdate, ProfessionalOut, ReviewCreate, ReviewOut
)

router = APIRouter(prefix="/health-wellness", tags=["health-wellness"])


def _avg_rating(db: Session, professional_id: int) -> tuple[Optional[float], int]:
    result = db.query(
        func.avg(HealthReview.rating),
        func.count(HealthReview.id)
    ).filter(HealthReview.professional_id == professional_id).one()
    avg = round(float(result[0]), 1) if result[0] is not None else None
    count = result[1]
    return avg, count


def _to_out(db: Session, p: HealthProfessional) -> ProfessionalOut:
    avg, count = _avg_rating(db, p.id)
    return ProfessionalOut(
        id=p.id,
        name=p.name,
        specialty=p.specialty,
        city=p.city,
        phone=p.phone,
        price=p.price,
        notes=p.notes,
        avg_rating=avg,
        review_count=count,
        created_at=p.created_at,
        created_by_id=p.created_by_id,
    )


@router.get("", response_model=List[ProfessionalOut])
def list_professionals(
    city: Optional[str] = Query(None),
    specialty: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(HealthProfessional)
    if city:
        q = q.filter(HealthProfessional.city.ilike(f"%{city}%"))
    if specialty:
        q = q.filter(HealthProfessional.specialty.ilike(f"%{specialty}%"))
    professionals = q.order_by(HealthProfessional.created_at.desc()).all()
    return [_to_out(db, p) for p in professionals]


@router.post("", response_model=ProfessionalOut, status_code=201)
def add_professional(
    data: ProfessionalCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    p = HealthProfessional(**data.model_dump(), created_by_id=current_user.id)
    db.add(p)
    db.commit()
    db.refresh(p)
    return _to_out(db, p)


@router.put("/{professional_id}", response_model=ProfessionalOut)
def update_professional(
    professional_id: int,
    data: ProfessionalUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    p = db.get(HealthProfessional, professional_id)
    if not p:
        raise HTTPException(status_code=404, detail="Professional not found")
    # Admin can edit any. Coach can only edit their own entries.
    if current_user.role != "admin" and p.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator or an admin can edit this professional")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(p, field, value)
    db.commit()
    db.refresh(p)
    return _to_out(db, p)


@router.delete("/{professional_id}", status_code=204)
def delete_professional(
    professional_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    p = db.get(HealthProfessional, professional_id)
    if not p:
        raise HTTPException(status_code=404, detail="Professional not found")
    if current_user.role != "admin" and p.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the creator or an admin can delete this professional")
    db.delete(p)
    db.commit()


@router.get("/{professional_id}/reviews", response_model=List[ReviewOut])
def list_reviews(
    professional_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    p = db.get(HealthProfessional, professional_id)
    if not p:
        raise HTTPException(status_code=404, detail="Professional not found")
    reviews = (
        db.query(HealthReview)
        .filter(HealthReview.professional_id == professional_id)
        .order_by(HealthReview.created_at.desc())
        .all()
    )
    return [
        ReviewOut(
            id=r.id,
            user_id=r.user_id,
            reviewer_name=r.user.full_name,
            rating=r.rating,
            comment=r.comment,
            created_at=r.created_at,
        )
        for r in reviews
    ]


@router.put("/{professional_id}/reviews/{review_id}", response_model=ReviewOut)
def update_review(
    professional_id: int,
    review_id: int,
    data: ReviewCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    review = db.query(HealthReview).filter(
        HealthReview.id == review_id,
        HealthReview.professional_id == professional_id,
    ).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    if review.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own review")
    review.rating = data.rating
    review.comment = data.comment
    db.commit()
    db.refresh(review)
    return ReviewOut(
        id=review.id,
        user_id=review.user_id,
        reviewer_name=current_user.full_name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )


@router.post("/{professional_id}/reviews", response_model=ReviewOut, status_code=201)
def add_review(
    professional_id: int,
    data: ReviewCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    p = db.get(HealthProfessional, professional_id)
    if not p:
        raise HTTPException(status_code=404, detail="Professional not found")
    existing = db.query(HealthReview).filter(
        HealthReview.professional_id == professional_id,
        HealthReview.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="You have already reviewed this professional")
    review = HealthReview(
        professional_id=professional_id,
        user_id=current_user.id,
        rating=data.rating,
        comment=data.comment,
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    return ReviewOut(
        id=review.id,
        user_id=review.user_id,
        reviewer_name=current_user.full_name,
        rating=review.rating,
        comment=review.comment,
        created_at=review.created_at,
    )
