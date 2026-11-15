"use client";

// ドラッグ＆ドロップで並び替えできる一覧（パソコンのマウス・スマホのタッチ両対応）
// 各行の左端の「⋮⋮」をつかんで上下に動かすと順番が入れ替わり、指を離した時点で onReorder が呼ばれる。
// 「選手管理」の選手一覧と「項目設定」の項目一覧で共通で使う。

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";

type Id = string | number;

type Props<T> = {
  items: T[];
  getId: (item: T) => Id;
  render: (item: T) => ReactNode; // つまみ（⋮⋮）より右側の中身
  // 並び替えが確定したとき（新しい順番のID一覧）。false を返す／失敗したら元の順番に戻す
  onReorder: (ids: Id[]) => void | boolean | Promise<unknown>;
  disabled?: boolean; // true のときは つまみを出さない（絞り込み中など）
};

export default function SortableList<T>({ items, getId, render, onReorder, disabled }: Props<T>) {
  // 画面上の順番。ドロップした瞬間にこちらを先に変えるので、保存を待たずに見た目が切り替わる
  const incoming = items.map(getId);
  const [order, setOrder] = useState<Id[]>(incoming);
  const key = incoming.join("|");
  // 親から届く順番が変わったら（保存後の再読み込み・項目の追加削除など）それに合わせる
  useEffect(() => {
    setOrder(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const byId = new Map(items.map((x) => [getId(x), x]));
  const shown = order.map((id) => byId.get(id)).filter((x): x is T => x !== undefined);

  const sensors = useSensors(
    // マウス・タッチ共通：つまみ（⋮⋮）を 4px 動かしたらドラッグ開始。
    // つまみ部分だけ画面のスクロールを止めているので（CSS の touch-action:none）、
    // 行のほかの場所を触れば今までどおり画面をスクロールできる
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(active.id);
    const to = order.indexOf(over.id);
    if (from < 0 || to < 0) return;
    const prev = order;
    const next = arrayMove(order, from, to);
    setOrder(next);
    Promise.resolve()
      .then(() => onReorder(next))
      .then((ok) => ok === false && setOrder(prev))
      .catch(() => setOrder(prev));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className="sortlist">
          {shown.map((item) => (
            <Row key={getId(item)} id={getId(item)} disabled={disabled}>
              {render(item)}
            </Row>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, disabled, children }: { id: Id; disabled?: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={`mrow srow ${isDragging ? "dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      {!disabled && (
        <button type="button" ref={setActivatorNodeRef} className="grip" aria-label="ドラッグして並び替え" {...attributes} {...listeners}>
          ⋮⋮
        </button>
      )}
      {children}
    </div>
  );
}
