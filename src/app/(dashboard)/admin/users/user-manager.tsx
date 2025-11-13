"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import type { Role, User } from "@/db/schema";
import { Pagination } from "@/components/admin/pagination";
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
  status: z.enum(["active", "inactive"]).optional(),
  department: z.enum(["curator", "scraping"], { required_error: "Select a department" }),
  googleCalendarTag: z.string().optional(),
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
  status: undefined,
  department: "" as "curator" | "scraping",
  googleCalendarTag: "",
  password: "",
};

type SortOption = {
  value: string;
  label: string;
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
  const [sortOption, setSortOption] = useState(USER_SORT_OPTIONS[0]?.value ?? "created-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchFilters, setSearchFilters] = useState({
    name: "",
    email: "",
    role: "",
    status: "",
    department: "",
  });

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
      status: user.status ?? undefined,
      department: (user.department ?? "curator") as "curator" | "scraping",
      googleCalendarTag: user.googleCalendarTag ?? "",
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
      status: values.status,
      department: values.department,
      googleCalendarTag: values.googleCalendarTag || undefined,
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

  const { filteredAndSortedUsers, totalFilteredUsers } = useMemo(() => {
    const filtered = users.filter((user) => {
      if (searchFilters.name && !user.name.toLowerCase().includes(searchFilters.name.toLowerCase())) {
        return false;
      }
      if (searchFilters.email && !user.email.toLowerCase().includes(searchFilters.email.toLowerCase())) {
        return false;
      }
      if (searchFilters.role && user.roleId !== searchFilters.role) {
        return false;
      }
      if (searchFilters.status && user.status !== searchFilters.status) {
        return false;
      }
      if (searchFilters.department && user.department !== searchFilters.department) {
        return false;
      }
      return true;
    });

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

    return { filteredAndSortedUsers: sorted, totalFilteredUsers: sorted.length };
  }, [users, searchFilters, sortOption]);

  // Paginate the filtered and sorted users
  const visibleUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedUsers.slice(startIndex, endIndex);
  }, [filteredAndSortedUsers, currentPage, pageSize]);

  // Reset to page 1 when filters change
  const handleSearchFilterChange = (newFilters: typeof searchFilters) => {
    setSearchFilters(newFilters);
    setCurrentPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleSearchReset = () => {
    handleSearchFilterChange({
      name: "",
      email: "",
      role: "",
      status: "",
      department: "",
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Users</h1>
          <p className="text-sm text-slate-400">
            Invite teammates and manage their access levels across modules.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleAddUser}
          disabled={!ability.canAdd || isPending}
        >
          + Add Users
        </Button>
      </div>

      {/* Search Form */}
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col gap-4 sm:flex-row sm:flex-wrap" onSubmit={handleSearchSubmit}>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="search-name" className="mb-1.5 block text-xs font-medium text-slate-300">
                Name
              </Label>
              <Input
                type="text"
                id="search-name"
                name="name"
                placeholder="Search by name..."
                value={searchFilters.name}
                onChange={(e) => handleSearchFilterChange({ ...searchFilters, name: e.target.value })}
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="search-email" className="mb-1.5 block text-xs font-medium text-slate-300">
                Email
              </Label>
              <Input
                type="text"
                id="search-email"
                name="email"
                placeholder="Search by email..."
                value={searchFilters.email}
                onChange={(e) => handleSearchFilterChange({ ...searchFilters, email: e.target.value })}
              />
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="search-role" className="mb-1.5 block text-xs font-medium text-slate-300">
                Role
              </Label>
              <Select
                id="search-role"
                name="role"
                value={searchFilters.role}
                onChange={(e) => handleSearchFilterChange({ ...searchFilters, role: e.target.value })}
              >
                <option value="">All Roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.roleName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="search-status" className="mb-1.5 block text-xs font-medium text-slate-300">
                Status
              </Label>
              <Select
                id="search-status"
                name="status"
                value={searchFilters.status}
                onChange={(e) => handleSearchFilterChange({ ...searchFilters, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div className="flex-1 min-w-0 sm:min-w-[200px]">
              <Label htmlFor="search-department" className="mb-1.5 block text-xs font-medium text-slate-300">
                Department
              </Label>
              <Select
                id="search-department"
                name="department"
                value={searchFilters.department}
                onChange={(e) => handleSearchFilterChange({ ...searchFilters, department: e.target.value })}
              >
                <option value="">All Departments</option>
                <option value="curator">Curator</option>
                <option value="scraping">Scraping</option>
              </Select>
            </div>
            <div className="flex w-full sm:w-auto items-end gap-2">
              <Button type="submit" className="flex-1 sm:flex-none">
                Search
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleSearchReset}
                className="flex-1 sm:flex-none"
              >
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {message && (!isModalOpen || message.tone !== "error") ? (
        <Alert variant={message.tone}>{message.text}</Alert>
      ) : null}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/60 text-left text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">No</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {visibleUsers.length ? (
                  visibleUsers.map((user, index) => {
                    const rowNumber = (currentPage - 1) * pageSize + index + 1;
                    return (
                      <tr key={user.id} className="hover:bg-slate-900/50">
                        <td className="px-4 py-2">{rowNumber}</td>
                      <td className="px-4 py-2 text-slate-100">{user.name}</td>
                      <td className="px-4 py-2 text-slate-300">{user.email}</td>
                      <td className="px-4 py-2 text-slate-300">{user.role?.roleName ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-300 capitalize">{user.status ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-300 capitalize">{user.department ?? "—"}</td>
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
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={7}
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

      {/* Pagination */}
      <Pagination
        totalItems={totalFilteredUsers}
        currentPage={currentPage}
        pageSize={pageSize}
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />

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

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="department">Department</Label>
              <Select
                id="department"
                value={form.watch("department") ?? ""}
                onChange={(event) => form.setValue("department", event.target.value as "curator" | "scraping" | undefined, { shouldDirty: true })}
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
              >
                <option value="">Select a department</option>
                <option value="curator">Curator</option>
                <option value="scraping">Scraping</option>
              </Select>
              {form.formState.errors.department ? (
                <p className="text-sm text-red-400">{form.formState.errors.department.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={form.watch("status") ?? ""}
                onChange={(event) => form.setValue("status", event.target.value as "active" | "inactive" | undefined, { shouldDirty: true })}
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
              >
                <option value="">Select status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
              {form.formState.errors.status ? (
                <p className="text-sm text-red-400">{form.formState.errors.status.message}</p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="googleCalendarTag">Google Calendar Tag</Label>
              <textarea
                id="googleCalendarTag"
                rows={3}
                placeholder="Add relevant Google Calendar tags..."
                disabled={(editingUserId ? !ability.canEdit : !ability.canAdd) || isPending}
                {...form.register("googleCalendarTag")}
                className="w-full rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {form.formState.errors.googleCalendarTag ? (
                <p className="text-sm text-red-400">{form.formState.errors.googleCalendarTag.message}</p>
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
