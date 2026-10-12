"use client";

import { type SmartClass } from "@/features/partner/api";
import { Dialog, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClassStudentsPanel } from "@/features/partner/class-students-panel";

/** Dialog wrapper around ClassStudentsPanel, shared by the class list and class detail pages. */
export function ClassStudentsDialog({ cls, onClose }: { cls: SmartClass; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title={`Học viên — ${cls.name}`} size="lg">
      <DialogBody>
        <ClassStudentsPanel cls={cls} />
      </DialogBody>
      <DialogFooter className="justify-end">
        <Button variant="outline" onClick={onClose}>
          Đóng
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
