"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type { ModuleName, Role, RolePermission } from "@/db/schema";
import { TableControls, SortOption } from "@/components/admin/table-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";

import { createRoleAction, deleteRoleAction, RoleFormInput, updateRoleAction } from "./actions";

const formSchema = z.object({
  roleName: z.string().min(2, "Role name must be at least 2 characters"),
  permissions: z.array(
    z.object({
      module: z.string(),
      canList: z.boolean(),
      canAdd: z.boolean(),
      canEdit: z.boolean(),
      canDelete: z.boolean(),
    }),
  ),
});

type FormValues = z.infer<typeof formSchema>;

type PermissionAbility = {
  canList: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type RoleWithPermissions = Role & {
  permissions: RolePermission[];
};

type MessageState =
  | {
      text: string;
      tone: "success" | "error" | "info";
    }
  | null;

interface RoleManagerProps {
  roles: RoleWithPermissions[];
  modules: ModuleName[];
  ability: PermissionAbility;
}

const ROLE_SORT_OPTIONS: SortOption[] = [
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
  { value: "name-asc", label: "Role A → Z" },
  { value: "name-desc", label: "Role Z → A" },
  { value: "modules-desc", label: "Most permissions" },
  { value: "modules-asc", label: "Fewest permissions" },
];

export function RoleManager({ roles, modules, ability }: RoleManagerProps) {
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingDeleteRole, setPendingDeleteRole] = useState<RoleWithPermissions | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<string>(ROLE_SORT_OPTIONS[0]?.value ?? "created-desc");

  const defaultPermissions = useMemo(
    () =>
      modules.map((module) => ({
        module,
        canList: false,
        canAdd: false,
        canEdit: false,
        canDelete: false,
      })),
    [modules],
  );

  const createEmptyFormValues = () => ({
    roleName: "",
    permissions: defaultPermissions.map((perm) => ({ ...perm })),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: createEmptyFormValues(),
  });

  const permissionsValues = useWatch({ control: form.control, name: "permissions" });

  const handleCloseModal = (preserveMessage = false) => {
    setIsModalOpen(false);
    setEditingRoleId(null);
    form.reset(createEmptyFormValues());
    if (!preserveMessage) {
      setMessage(null);
    }
  };

  const handleAddRole = () => {
    setMessage(null);
    setEditingRoleId(null);
    form.reset(createEmptyFormValues());
    setIsModalOpen(true);
  };

  const handleSelectRole = (role: RoleWithPermissions) => {
    setMessage(null);
    setEditingRoleId(role.id);
    form.reset({
      roleName: role.roleName,
      permissions: defaultPermissions.map((perm) => {
        const existing = role.permissions.find((p) => p.module === perm.module);
        return existing
          ? {
              module: perm.module,
              canList: existing.canList,
              canAdd: existing.canAdd,
              canEdit: existing.canEdit,
              canDelete: existing.canDelete,
            }
          : { ...perm };
      }),
    });
    setIsModalOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    setMessage(null);
    const payload: RoleFormInput = {
      roleName: values.roleName,
      permissions: values.permissions.map((perm) => ({
        module: perm.module as ModuleName,
        canList: perm.canList,
        canAdd: perm.canAdd,
        canEdit: perm.canEdit,
        canDelete: perm.canDelete,
      })),
    };

    const roleLabel = values.roleName;
    const isEditing = Boolean(editingRoleId);

    startTransition(async () => {
      try {
        if (isEditing && editingRoleId) {
          await updateRoleAction(editingRoleId, payload);
          setMessage({
            text: `Role ${roleLabel} updated successfully.`,
            tone: "success",
          });
        } else {
          await createRoleAction(payload);
          setMessage({
            text: `Role ${roleLabel} created successfully.`,
            tone: "success",
          });
        }
        handleCloseModal(true);
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to save role.",
          tone: "error",
        });
      }
    });
  };

  const requestDeleteRole = (role: RoleWithPermissions) => {
    setMessage(null);
    setPendingDeleteRole(role);
  };

  const cancelDeleteRequest = () => {
    if (!isPending) {
      setPendingDeleteRole(null);
    }
  };

  const confirmDeleteRole = () => {
    if (!pendingDeleteRole) {
      return;
    }
    const roleToDelete = pendingDeleteRole;
    const isEditingTarget = editingRoleId === roleToDelete.id;
    setMessage(null);
    startTransition(async () => {
      try {
        await deleteRoleAction(roleToDelete.id);
        if (isEditingTarget) {
          handleCloseModal(true);
        }
        setMessage({
          text: `Role ${roleToDelete.roleName} successfully deleted.`,
          tone: "success",
        });
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to delete role.",
          tone: "error",
        });
      } finally {
        setPendingDeleteRole(null);
      }
    });
  };

  const isFormDisabled = (editingRoleId ? !ability.canEdit : !ability.canAdd) || isPending;

  const visibleRoles = useMemo(() => {
    const normalized = searchQuery.trim().toLowerCase();
    const filtered = normalized
      ? roles.filter((role) => {
          const permissionModules = role.permissions.map((perm) => perm.module).join(" ").toLowerCase();
          const haystack = `${role.roleName} ${permissionModules}`.toLowerCase();
          return haystack.includes(normalized);
        })
      : roles.slice();

    const toTime = (value: Date | string | null | undefined) =>
      value ? new Date(value).getTime() : 0;

    return filtered.sort((a, b) => {
      switch (sortOption) {
        case "name-asc":
          return a.roleName.localeCompare(b.roleName, undefined, { sensitivity: "base" });
        case "name-desc":
          return b.roleName.localeCompare(a.roleName, undefined, { sensitivity: "base" });
        case "modules-desc":
          return b.permissions.length - a.permissions.length;
        case "modules-asc":
          return a.permissions.length - b.permissions.length;
        case "created-asc":
          return toTime(a.createdAt) - toTime(b.createdAt);
        case "created-desc":
        default:
          return toTime(b.createdAt) - toTime(a.createdAt);
      }
    });
  }, [roles, searchQuery, sortOption]);

  return (
    <div className="space-y-6">
      <TableControls
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search roles by name or module…"
        sortValue={sortOption}
        onSortChange={setSortOption}
        sortOptions={ROLE_SORT_OPTIONS}
        actions={
          <Button type="button" onClick={handleAddRole} disabled={!ability.canAdd || isPending}>
            Add Role
          </Button>
        }
      />

      {message && (!isModalOpen || message.tone !== "error") ? (
        <Alert variant={message.tone}>{message.text}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">Role Name</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visibleRoles.length ? (
                  visibleRoles.map((role) => (
                    <tr key={role.id} className="hover:bg-slate-900/50">
                      <td className="px-4 py-2">{role.roleName}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSelectRole(role)}
                            disabled={!ability.canEdit || isPending}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => requestDeleteRole(role)}
                            disabled={!ability.canDelete || isPending}
                            className="border-red-500 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-500">
                      No roles found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={() => handleCloseModal()} contentClassName="max-w-4xl">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editingRoleId ? "Edit Role" : "Create Role"}
            </h2>
          </div>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="roleName">Role Name</Label>
              <Input
                id="roleName"
                disabled={isFormDisabled}
                {...form.register("roleName")}
              />
              {form.formState.errors.roleName ? (
                <p className="text-sm text-red-400">{form.formState.errors.roleName.message}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              <p className="text-sm font-medium text-slate-300">Permissions</p>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-900/60 text-left text-slate-400">
                    <tr>
                      <th className="px-4 py-2 font-medium">Module</th>
                      <th className="px-4 py-2 font-medium">List</th>
                      <th className="px-4 py-2 font-medium">Add</th>
                      <th className="px-4 py-2 font-medium">Edit</th>
                      <th className="px-4 py-2 font-medium">Delete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {modules.map((module, index) => {
                      const formattedModule = module.replace(/_/g, " ");
                      const current = permissionsValues?.[index];
                      return (
                        <tr key={module} className="hover:bg-slate-900/50">
                          <td className="px-4 py-2 capitalize">{formattedModule}</td>
                          {(["canList", "canAdd", "canEdit", "canDelete"] as const).map((field) => (
                            <td key={field} className="px-4 py-2">
                              <Checkbox
                                disabled={isFormDisabled}
                                checked={current ? Boolean(current[field]) : false}
                                onChange={(event) =>
                                  form.setValue(
                                    `permissions.${index}.${field}`,
                                    event.target.checked,
                                    { shouldDirty: true },
                                  )
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {isModalOpen && message && message.tone === "error" ? (
              <Alert variant="error">{message.text}</Alert>
            ) : null}

            <div className="flex items-center justify-end gap-3">
              <Button type="submit" disabled={isFormDisabled}>
                {isPending ? "Saving..." : editingRoleId ? "Update Role" : "Create Role"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCloseModal()}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDeleteRole)}
        title="Confirm deletion"
        description={
          pendingDeleteRole ? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-100">{pendingDeleteRole.roleName}</span>? This
              action cannot be undone.
            </>
          ) : undefined
        }
        onCancel={cancelDeleteRequest}
        onConfirm={confirmDeleteRole}
        cancelLabel="Cancel"
        confirmLabel="Delete"
        cancelProps={{ disabled: isPending }}
        confirmProps={{
          disabled: isPending,
          variant: "outline",
          className: "border-red-500 text-red-300 hover:bg-red-500/10 hover:text-red-200",
        }}
      />
    </div>
  );
}
