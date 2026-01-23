import { type ProjectShortCode, shortCodeCodec } from "@mono/api";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";

export type ProjectDialogMode = "create" | "rename";

export type ProjectDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: ProjectDialogMode;
  initialName?: string;
  initialShortCode?: string;
  onSubmit: (name: string, shortCode: ProjectShortCode) => void;
};

export function ProjectDialog({
  open,
  onOpenChange,
  mode,
  initialName = "",
  initialShortCode = "",
  onSubmit,
}: ProjectDialogProps) {
  const [name, setName] = useState(initialName);
  const [shortCode, setShortCode] = useState(initialShortCode);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setShortCode(initialShortCode);
    }
  }, [open, initialName, initialShortCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && shortCode.trim()) {
      onSubmit(
        name.trim(),
        shortCodeCodec.decode(shortCode.trim().toUpperCase()),
      );
      onOpenChange(false);
    }
  };

  const title = mode === "create" ? "Create Project" : "Rename Project";
  const description =
    mode === "create"
      ? "Enter a name and short code for your new project."
      : "Enter a new name and short code for this project.";
  const submitLabel = mode === "create" ? "Create" : "Rename";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label
                htmlFor="project-name"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Project Name
              </label>
              <Input
                id="project-name"
                placeholder="Project name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="mt-1"
              />
            </div>
            <div>
              <label
                htmlFor="short-code"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Short Code
              </label>
              <Input
                id="short-code"
                placeholder="ABC"
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                maxLength={10}
                className="mt-1 font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Letters only (A-Z). Will be converted to uppercase.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || !shortCode.trim()}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
