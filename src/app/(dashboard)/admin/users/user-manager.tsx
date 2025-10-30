"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type { Role, User } from "@/db/schema";
import { TableControls, SortOption } from "@/components/admin/table-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import {
  createUserAction,
  deleteUserAction,
  updateUserAction,
  UserFormInput,
} from "./actions";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Enter a valid email"),
  discordId: z.string().optional(),
  roleId: z.string().min(1, "Select a role"),
  password: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

type PermissionAbility = {
  canList: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

type UserWithRole = User & {
  role: Role | null;
};

type MessageState =
  | {
      text: string;
      tone: "success" | "error" | "info";
    }
  | null;

interface UserManagerProps {
  users: UserWithRole[];
  roles: Role[];
  ability: PermissionAbility;
}

const defaultValues: FormValues = {
  name: "",
  email: "",
  discordId: "",
  roleId: "",
  password: "",
};

const USER_SORT_OPTIONS: SortOption[] = [
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
  { value: "name-asc", label: "Name A → Z" },
  { value: "name-desc", label: "Name Z → A" },
  { value: "email-asc", label: "Email A → Z" },
  { value: "email-desc", label: "Email Z → A" },
  { value: "role-asc", label: "Role A → Z" },
  { value: "role-desc", label: "Role Z → A" },
];

export function UserManager({ users = [], roles = [], ability }: UserManagerProps) {
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState>(null);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<UserWithRole | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState(USER_SORT_OPTIONS[0]?.value ?? "created-desc");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });
  const roleIdValue = useWatch({ control: form.control, name: "roleId" });

  const resetFormState = () => {
    setEditingUserId(null);
    form.reset({ ...defaultValues });
  };

  const handleCloseModal = (preserveMessage = false) => {
    setIsModalOpen(false);
    resetFormState();
    if (!preserveMessage) {
      setMessage(null);
    }
  };

  const handleAddUser = () => {
    setMessage(null);
    resetFormState();
    setIsModalOpen(true);
  };

  const handleSelectUser = (user: UserWithRole) => {
    setMessage(null);
    setEditingUserId(user.id);
    form.reset({
      name: user.name,
      email: user.email,
      discordId: user.discordId ?? "",
      roleId: user.roleId ?? "",
      password: "",
    });
    setIsModalOpen(true);
  };

  const onSubmit = (values: FormValues) => {
    setMessage(null);
    const payload: UserFormInput = {
      name: values.name,
      email: values.email,
      discordId: values.discordId || undefined,
      roleId: values.roleId,
      password: values.password ? values.password : undefined,
    };

    if (!editingUserId && !payload.password) {
      setMessage({
        text: "Temporary password is required for new users.",
        tone: "error",
      });
      return;
    }

    const isEditing = Boolean(editingUserId);

    startTransition(async () => {
      try {
        if (isEditing && editingUserId) {
          await updateUserAction(editingUserId, payload);
          setMessage({
            text: "User updated successfully.",
            tone: "success",
          });
        } else {
          await createUserAction(payload);
          setMessage({
            text: "User created successfully.",
            tone: "success",
          });
        }
        handleCloseModal(true);
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to save user.",
          tone: "error",
        });
      }
    });
  };

  const requestDeleteUser = (user: UserWithRole) => {
    setMessage(null);
    setPendingDeleteUser(user);
  };

  const cancelDeleteRequest = () => {
    if (!isPending) {
      setPendingDeleteUser(null);
    }
  };

  const confirmDeleteUser = () => {
    if (!pendingDeleteUser) {
      return;
    }
    setMessage(null);
    const { id, name, email } = pendingDeleteUser;
    const isEditingTarget = editingUserId === id;
    startTransition(async () => {
      try {
        await deleteUserAction(id);
        if (isEditingTarget) {
          handleCloseModal(true);
        }
        setMessage({
          text: `User ${name} (${email}) successfully deleted.`,
          tone: "success",
        });
      } catch (error) {
        console.error(error);
        setMessage({
          text: error instanceof Error ? error.message : "Unable to delete user.",
          tone: "error",
        });
      } finally {
        setPendingDeleteUser(null);
      }
    });
  };

  const visibleUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = normalizedQuery
      ? users.filter((user) => {
          const haystack = [
            user.name,
            user.email,
            user.discordId ?? "",
            user.role?.roleName ?? "",
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : users.slice();

    const toDate = (value: Date | string | null | undefined) =>
      value ? new Date(value).getTime() : 0;

    const sorted = filtered.sort((a, b) => {
      switch (sortOption) {
        case "name-asc":
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        case "name-desc":
          return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        case "email-asc":
          return a.email.localeCompare(b.email, undefined, { sensitivity: "base" });
        case "email-desc":
          return b.email.localeCompare(a.email, undefined, { sensitivity: "base" });
        case "role-asc":
          return (a.role?.roleName ?? "").localeCompare(b.role?.roleName ?? "", undefined, {
            sensitivity: "base",
          });
        case "role-desc":
          return (b.role?.roleName ?? "").localeCompare(a.role?.roleName ?? "", undefined, {
            sensitivity: "base",
          });
        case "created-asc":
          return toDate(a.createdAt) - toDate(b.createdAt);
        case "created-desc":
        default:
          return toDate(b.createdAt) - toDate(a.createdAt);
      }
    });

    return sorted;
  }, [users, searchQuery, sortOption]);

  return (
    <div className="space-y-6">
      <TableControls
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search users by name, email, or role..."
        sortValue={sortOption}
        onSortChange={setSortOption}
        sortOptions={USER_SORT_OPTIONS}
        actions={
          <Button
            type="button"
            onClick={handleAddUser}
            disabled={!ability.canAdd || isPending}
          >
            Add Users
          </Button>
        }
      />

      {message && (!isModalOpen || message.tone !== "error") ? (
        <Alert variant={message.tone}>{message.text}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>User List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">No</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visibleUsers.length ? (
                  visibleUsers.map((user, index) => (
                    <tr key={user.id} className="hover:bg-slate-900/50">
                      <td className="px-4 py-2">{index + 1}</td>
                      <td className="px-4 py-2">{user.name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">{user.role?.roleName ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => handleSelectUser(user)}
                            disabled={!ability.canEdit || isPending}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => requestDeleteUser(user)}
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
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-slate-500"
                    >
                      No users found for the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal open={isModalOpen} onClose={() => handleCloseModal()}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              {editingUserId ? "Edit User" : "Create User"}
            </h2>
          </div>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
                {...form.register("name")}
              />
              {form.formState.errors.name ? (
                <p className="text-sm text-red-400">{form.formState.errors.name.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
                {...form.register("email")}
              />
              {form.formState.errors.email ? (
                <p className="text-sm text-red-400">{form.formState.errors.email.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="discordId">Discord ID</Label>
              <Input
                id="discordId"
                placeholder="username#0000"
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
                {...form.register("discordId")}
              />
              {form.formState.errors.discordId ? (
                <p className="text-sm text-red-400">{form.formState.errors.discordId.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="roleId">Role</Label>
              <Select
                id="roleId"
                value={roleIdValue ?? ""}
                onChange={(event) => form.setValue("roleId", event.target.value, { shouldDirty: true })}
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
              >
                <option value="">Select a role</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.roleName}
                  </option>
                ))}
              </Select>
              {form.formState.errors.roleId ? (
                <p className="text-sm text-red-400">{form.formState.errors.roleId.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="password">
                {editingUserId ? "Reset Password (optional)" : "Temporary Password"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={editingUserId ? "Leave blank to keep current password" : "Provide a secure password"}
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
                {...form.register("password")}
              />
              {form.formState.errors.password ? (
                <p className="text-sm text-red-400">{form.formState.errors.password.message}</p>
              ) : null}
            </div>

            {isModalOpen && message && message.tone === "error" ? (
              <Alert variant="error" className="md:col-span-2">
                {message.text}
              </Alert>
            ) : null}

            <div className="md:col-span-2 flex items-center justify-end gap-3">
              <Button
                type="submit"
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
              >
                {isPending ? "Saving..." : editingUserId ? "Update User" : "Create User"}
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
        open={Boolean(pendingDeleteUser)}
        title="Confirm deletion"
        description={
          pendingDeleteUser ? (
            <>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-slate-100">
                {pendingDeleteUser.name} ({pendingDeleteUser.email})
              </span>
              ? This action cannot be undone.
            </>
          ) : undefined
        }
        onCancel={cancelDeleteRequest}
        onConfirm={confirmDeleteUser}
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
