from __future__ import annotations
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, get_active_team_id
from ..models.user import User
from ..models.todo import Todo
from ..schemas.todo import TodoCreate, TodoUpdate, TodoOut

router = APIRouter(prefix="/todos", tags=["todos"])


def _owned(todo_id: int, user: User, db: Session) -> Todo:
    todo = db.get(Todo, todo_id)
    if todo is None or todo.user_id != user.id:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@router.get("", response_model=list[TodoOut])
def list_todos(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    # Open items first, newest first within each group.
    return (
        db.query(Todo)
        .filter(Todo.user_id == current_user.id)
        .order_by(Todo.done.asc(), Todo.created_at.desc())
        .all()
    )


@router.post("", response_model=TodoOut, status_code=201)
def create_todo(
    body: TodoCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)] = None,
):
    todo = Todo(
        user_id=current_user.id,
        team_id=active_team_id,
        text=body.text,
        note=(body.note or None),
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    body: TodoUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = _owned(todo_id, current_user, db)
    data = body.model_dump(exclude_unset=True)
    if "text" in data:
        todo.text = data["text"]
    if "note" in data:
        todo.note = (data["note"] or None)
    if "done" in data:
        todo.done = bool(data["done"])
    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/completed", status_code=204)
def clear_completed(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    db.query(Todo).filter(
        Todo.user_id == current_user.id, Todo.done.is_(True)
    ).delete(synchronize_session=False)
    db.commit()


@router.delete("/{todo_id}", status_code=204)
def delete_todo(
    todo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = _owned(todo_id, current_user, db)
    db.delete(todo)
    db.commit()
