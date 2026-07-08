"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteShell from "../components/SiteShell";
import { signOutUserAndRedirect } from "../lib/clientAuth";

const sectionStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "18px",
  padding: "18px",
  background: "#f8fbff",
  marginBottom: "16px",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.8fr)",
  gap: "16px",
  alignItems: "start",
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "14px",
};

const profileHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr)",
  gap: "16px",
  alignItems: "center",
};

const avatarFrameStyle: React.CSSProperties = {
  width: "96px",
  height: "96px",
  borderRadius: "24px",
  background: "linear-gradient(135deg, #173b6c 0%, #245ca1 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#ffffff",
  fontWeight: 900,
  fontSize: "28px",
  overflow: "hidden",
  border: "1px solid #bfdbfe",
};

const metadataGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "10px",
};

const metadataCardStyle: React.CSSProperties = {
  border: "1px solid #d8e0ec",
  borderRadius: "14px",
  padding: "12px 14px",
  background: "#ffffff",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: "6px",
  color: "#173b6c",
  fontWeight: 800,
};

const statLabel: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 800,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd7e6",
  borderRadius: "12px",
  padding: "12px 13px",
  background: "#ffffff",
  color: "#16213e",
  fontSize: "15px",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: "none",
};

const readOnlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "#f8fafc",
  color: "#475569",
};

const statusMessageStyle: React.CSSProperties = {
  minHeight: "22px",
  fontSize: "14px",
  fontWeight: 700,
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #173b6c",
  background: "#173b6c",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: "12px",
  border: "1px solid #cfd7e6",
  background: "#ffffff",
  color: "#173b6c",
  fontWeight: 800,
  cursor: "pointer",
};

type RoleValue = "sp" | "faculty" | "sim_op" | "admin" | "super_admin";

type MeResponse = {
  user?: {
    id: string;
    email?: string | null;
    created_at?: string | null;
    last_sign_in_at?: string | null;
    email_confirmed_at?: string | null;
  };
  profile?: {
    id: string;
    full_name: string | null;
    schedule_match_name?: string | null;
    schedule_name?: string | null;
    email: string | null;
    role: string | null;
    is_active: boolean | null;
    profile_image_url?: string | null;
  } | null;
  profile_available?: boolean;
  sp_link?: {
    status?: string | null;
    sp_id?: string | null;
    sp_name?: string | null;
    matched_by?: string | null;
    onboarding_message?: string | null;
  };
  message?: string;
  warning?: string;
  error?: string;
};

type FormState = {
  fullName: string;
  scheduleName: string;
  role: RoleValue;
  profileImageUrl: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const ROLE_OPTIONS: Array<{ value: RoleValue; label: string }> = [
  { value: "sp", label: "SP" },
  { value: "faculty", label: "Faculty" },
  { value: "sim_op", label: "Sim Op" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];

const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_MAX_DIMENSION = 768;
const PROFILE_IMAGE_INITIAL_QUALITY = 0.82;
const PROFILE_IMAGE_MIN_QUALITY = 0.52;
const PROFILE_IMAGE_SIZE_ERROR_MESSAGE =
  "Please choose an image smaller than 3 MB. Large images are automatically compressed before upload.";
const PROFILE_IMAGE_TYPE_ERROR_MESSAGE = "Please choose a JPG, PNG, or WebP image.";
const SUPPORTED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function asText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeRole(value: unknown): RoleValue {
  const role = asText(value).toLowerCase().replace(/[\s-]+/g, "_");
  if (role === "faculty" || role === "sim_op" || role === "admin" || role === "super_admin" || role === "sp") return role;
  return "sp";
}

function formatRoleLabel(role: RoleValue) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label || "SP";
}

function getDataUrlByteSize(dataUrl: string) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) return 0;
  const base64 = parts[1] || "";
  const paddingMatch = base64.match(/=*$/);
  const padding = paddingMatch ? paddingMatch[0].length : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read image file."));
    };
    image.src = objectUrl;
  });
}

function canvasSupportsWebp() {
  const canvas = document.createElement("canvas");
  const dataUrl = canvas.toDataURL("image/webp");
  return dataUrl.startsWith("data:image/webp");
}

function renderCompressedProfileImage(canvas: HTMLCanvasElement, mimeType: "image/webp" | "image/jpeg") {
  let quality = PROFILE_IMAGE_INITIAL_QUALITY;
  let attempts = 0;

  while (attempts < 8) {
    const dataUrl = canvas.toDataURL(mimeType, quality);
    if (getDataUrlByteSize(dataUrl) <= PROFILE_IMAGE_MAX_BYTES) return dataUrl;
    quality -= 0.08;
    if (quality < PROFILE_IMAGE_MIN_QUALITY) break;
    attempts += 1;
  }

  return "";
}

async function buildCompressedProfileImageDataUrl(file: File) {
  const image = await loadImageElement(file);
  const originalWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const originalHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const preferredMimeType: "image/webp" | "image/jpeg" = canvasSupportsWebp() ? "image/webp" : "image/jpeg";
  let maxDimension = PROFILE_IMAGE_MAX_DIMENSION;
  let attempt = 0;

  while (attempt < 6) {
    const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image compression is unavailable in this browser.");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    const compressed =
      renderCompressedProfileImage(canvas, preferredMimeType) ||
      (preferredMimeType !== "image/jpeg" ? renderCompressedProfileImage(canvas, "image/jpeg") : "");
    if (compressed) return compressed;

    maxDimension = Math.max(256, Math.round(maxDimension * 0.85));
    attempt += 1;
  }

  throw new Error(PROFILE_IMAGE_SIZE_ERROR_MESSAGE);
}

function getFormState(body: MeResponse | null): FormState {
  return {
    fullName: asText(body?.profile?.full_name),
    scheduleName: asText(body?.profile?.schedule_match_name ?? body?.profile?.schedule_name),
    role: normalizeRole(body?.profile?.role),
    profileImageUrl: asText(body?.profile?.profile_image_url),
  };
}

function sameFormState(a: FormState, b: FormState) {
  return (
    a.fullName === b.fullName &&
    a.scheduleName === b.scheduleName &&
    a.role === b.role &&
    a.profileImageUrl === b.profileImageUrl
  );
}

function parseApiText(text: string) {
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as MeResponse;
  } catch {
    return null;
  }
}

function getApiErrorMessage(text: string, fallback: string) {
  const body = parseApiText(text);
  return asText(body?.error) || asText(body?.message) || asText(text) || fallback;
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unavailable";
  return parsed.toLocaleString();
}

function getRoleTone(role: RoleValue): React.CSSProperties {
  if (role === "super_admin") {
    return { background: "#f5f3ff", color: "#6d28d9", border: "1px solid #c4b5fd" };
  }
  if (role === "admin") {
    return { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" };
  }
  if (role === "sim_op") {
    return { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd" };
  }
  if (role === "faculty") {
    return { background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ddd6fe" };
  }
  return { background: "#ecfdf3", color: "#166534", border: "1px solid #86efac" };
}

export default function MePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [warningMessage, setWarningMessage] = useState("");
  const [data, setData] = useState<MeResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [role, setRole] = useState<RoleValue>("sp");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [savedForm, setSavedForm] = useState<FormState>({
    fullName: "",
    scheduleName: "",
    role: "sp",
    profileImageUrl: "",
  });
  const [showAdvancedDetails, setShowAdvancedDetails] = useState(false);
  const [imagePickerBusy, setImagePickerBusy] = useState(false);

  const redirectToLogin = useCallback(() => {
    router.replace("/login");
    router.refresh();
    window.location.replace("/login");
  }, [router]);

  const applyResponseToForm = useCallback((body: MeResponse | null) => {
    const nextForm = getFormState(body);
    setData(body);
    setFullName(nextForm.fullName);
    setScheduleName(nextForm.scheduleName);
    setRole(nextForm.role);
    setProfileImageUrl(nextForm.profileImageUrl);
    setSavedForm(nextForm);
  }, []);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setWarningMessage("");

    try {
      const response = await fetch("/api/me", {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const responseText = await response.text();
      const body = parseApiText(responseText);

      if (!response.ok) {
        setErrorMessage(asText(body?.error) || "Could not load account details.");
        setLoading(false);
        return;
      }

      applyResponseToForm(body);
      setLoading(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load account details.");
      setLoading(false);
    }
  }, [applyResponseToForm, redirectToLogin]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await loadProfile();
      if (cancelled) return;
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const currentForm = useMemo<FormState>(
    () => ({
      fullName,
      scheduleName,
      role,
      profileImageUrl,
    }),
    [fullName, profileImageUrl, role, scheduleName]
  );

  const isDirty = useMemo(() => !sameFormState(currentForm, savedForm), [currentForm, savedForm]);

  const clearSaveFeedback = useCallback(() => {
    setSaveState("idle");
    setSuccessMessage("");
    setErrorMessage("");
  }, []);

  const email = data?.profile?.email || data?.user?.email || "";
  const profileId = data?.profile?.id || "Unavailable";
  const userId = data?.user?.id || "Unavailable";
  const isSpRole = role === "sp";
  const currentAccountRole = normalizeRole(data?.profile?.role);
  const canEditRole =
    currentAccountRole === "admin" || currentAccountRole === "super_admin" || currentAccountRole === "sim_op";
  const profileImagePreview = asText(profileImageUrl);
  const avatarFallback = (asText(fullName) || asText(email) || "CF")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const isActive = useMemo(() => {
    if (data?.profile?.is_active === null || data?.profile?.is_active === undefined) {
      return "Unknown";
    }
    return data.profile.is_active ? "Active" : "Inactive";
  }, [data]);

  async function handleProfileImageSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fileType = asText(file.type).toLowerCase();
    if (!SUPPORTED_PROFILE_IMAGE_TYPES.has(fileType)) {
      setErrorMessage(PROFILE_IMAGE_TYPE_ERROR_MESSAGE);
      return;
    }

    setImagePickerBusy(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const nextUrl = await buildCompressedProfileImageDataUrl(file);
      if (getDataUrlByteSize(nextUrl) > PROFILE_IMAGE_MAX_BYTES) throw new Error(PROFILE_IMAGE_SIZE_ERROR_MESSAGE);
      if (!nextUrl) throw new Error("Could not prepare image preview.");
      clearSaveFeedback();
      setProfileImageUrl(nextUrl);
      setSuccessMessage("Profile image prepared. Click Save Profile to apply it.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load image.");
    } finally {
      setImagePickerBusy(false);
    }
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");
    setErrorMessage("");
    setSuccessMessage("");
    setWarningMessage("");

    const payload = {
      full_name: fullName,
      schedule_match_name: scheduleName,
      schedule_name: scheduleName,
      role: normalizeRole(role),
      profile_image_url: profileImageUrl,
    };

    try {
      const response = await fetch("/api/me", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const responseText = await response.text();
      const body = parseApiText(responseText);

      if (!response.ok) {
        setErrorMessage(getApiErrorMessage(responseText, `${response.status} ${response.statusText}`));
        setWarningMessage(asText(body?.warning));
        setSaveState("error");
        return;
      }

      applyResponseToForm(body);
      setSuccessMessage(asText(body?.message) || "Profile saved.");
      setWarningMessage(asText(body?.warning));
      setSaveState("saved");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("cfsp-profile-updated"));
      }
      await loadProfile();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save profile.");
      setSaveState("error");
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOutUserAndRedirect();
      return;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not sign out cleanly.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <SiteShell
      title="Profile Settings"
      subtitle="Manage the profile details CFSP uses to match events, staffing, and operational ownership."
    >
      {errorMessage ? (
        <div style={{ ...sectionStyle, borderColor: "#fecaca", background: "#fff5f5", color: "#991b1b" }}>
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            ...sectionStyle,
            borderColor: "#86efac",
            background: "#ecfdf3",
            color: "#166534",
            fontWeight: 800,
          }}
        >
          {successMessage}
        </div>
      ) : null}

      {warningMessage ? (
        <div style={{ ...sectionStyle, borderColor: "#fed7aa", background: "#fff7ed", color: "#9a3412" }}>
          {warningMessage}
        </div>
      ) : null}

      <div style={gridStyle}>
        <form onSubmit={handleSave} style={sectionStyle}>
          <div style={profileHeaderStyle}>
            <div style={avatarFrameStyle}>
              {profileImagePreview ? (
                <Image
                  src={profileImagePreview}
                  alt="Profile"
                  width={96}
                  height={96}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  unoptimized
                />
              ) : (
                avatarFallback
              )}
            </div>

            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "6px 10px",
                  fontWeight: 900,
                  fontSize: "12px",
                  ...getRoleTone(role),
                }}
              >
                {formatRoleLabel(role)}
              </div>
              <h2 style={{ margin: "10px 0 0", color: "#173b6c", fontSize: "28px" }}>
                {fullName || "Member Profile"}
              </h2>
              <div style={{ marginTop: "6px", color: "#475569", fontWeight: 700 }}>
                {email || "No email on file"}
              </div>
              <div style={{ marginTop: "6px", color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                Account status: {isActive}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ margin: "18px 0 0", color: "#173b6c" }}>Editable Profile</h2>
            <p style={{ margin: "8px 0 0", color: "#64748b", lineHeight: 1.6 }}>
              {isSpRole
                ? "Update the account details your SP portal uses for assignments, training access, and directory matching."
                : "Update the internal member details used by scheduling and operations tools."}
            </p>
          </div>

          {loading ? (
            <p style={{ marginBottom: 0, color: "#64748b", fontWeight: 700 }}>Loading profile...</p>
          ) : (
            <div style={fieldGridStyle}>
              <label style={labelStyle}>
                Full Name
                <input
                  type="text"
                  value={fullName}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setFullName(event.target.value);
                  }}
                  style={inputStyle}
                  placeholder="Enter your full name"
                />
              </label>

              <label style={labelStyle}>
                {isSpRole ? "Schedule Match Name (optional)" : "Schedule Match Name"}
                <input
                  type="text"
                  value={scheduleName}
                  onChange={(event) => {
                    clearSaveFeedback();
                    setScheduleName(event.target.value);
                  }}
                  style={inputStyle}
                  placeholder="Example: Cory"
                />
              </label>

              <div style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.6, marginTop: "-2px" }}>
                {isSpRole
                  ? "Optional for SP accounts. Add it only if operations asked you to match imported schedule text."
                  : "Use the name that appears in imported schedule lead/team text, such as `Cory` or `Cory Brodsky`."}
              </div>

              <label style={labelStyle}>
                Email
                <input type="email" value={email} readOnly style={readOnlyInputStyle} />
              </label>

              <label style={labelStyle}>
                Profile Picture
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(event) => void handleProfileImageSelected(event)}
                  style={{ ...inputStyle, padding: "10px 12px" }}
                />
              </label>

              <div style={{ color: "#64748b", fontSize: "13px", lineHeight: 1.6, marginTop: "-2px" }}>
                Choose a JPG, PNG, or WebP image under 3 MB. Large images are automatically compressed before upload.
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", marginTop: "-2px" }}>
                <button
                  type="button"
                  onClick={() => {
                    clearSaveFeedback();
                    setProfileImageUrl("");
                  }}
                  disabled={!profileImageUrl || imagePickerBusy}
                  style={{ ...secondaryButtonStyle, padding: "10px 14px" }}
                >
                  Remove Photo
                </button>
                <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 700 }}>
                  {imagePickerBusy ? "Preparing image..." : profileImageUrl ? "Photo ready to save" : "Using initials fallback"}
                </span>
              </div>

              {canEditRole ? (
                <label style={labelStyle}>
                  Role
                  <select
                    value={role}
                    onChange={(event) => {
                      clearSaveFeedback();
                      setRole(normalizeRole(event.target.value));
                    }}
                    style={selectStyle}
                  >
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "4px" }}>
                <button
                  type="submit"
                  style={{
                    ...primaryButtonStyle,
                    opacity: saveState === "saving" ? 0.7 : 1,
                    background:
                      saveState === "saved" ? "#166534" : saveState === "error" ? "#b91c1c" : "#173b6c",
                    border:
                      saveState === "saved"
                        ? "1px solid #166534"
                        : saveState === "error"
                          ? "1px solid #b91c1c"
                          : "1px solid #173b6c",
                    boxShadow: saveState === "saved" ? "0 0 0 3px rgba(34, 197, 94, 0.18)" : "none",
                    transition: "background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
                  }}
                  disabled={saveState === "saving" || (!isDirty && saveState === "idle")}
                >
                  {saveState === "saving"
                    ? "Saving..."
                    : saveState === "saved"
                      ? "Saved"
                      : saveState === "error"
                        ? "Error saving"
                        : "Save Profile"}
                </button>
              </div>

              <div
                style={{
                  ...statusMessageStyle,
                  color:
                    saveState === "error"
                      ? "#991b1b"
                      : saveState === "saved"
                        ? "#166534"
                        : "#64748b",
                }}
              >
                {saveState === "saving"
                  ? "Saving your profile..."
                  : saveState === "saved"
                    ? successMessage || "Profile saved."
                    : saveState === "error"
                      ? errorMessage || "Could not save profile."
                      : "Update your profile details and save when you are ready."}
              </div>
            </div>
          )}
        </form>

        <div style={{ display: "grid", gap: "16px" }}>
          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Member Details</h2>
            {loading ? (
              <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>Loading account state...</p>
            ) : (
              <div style={{ ...metadataGridStyle, marginTop: "14px" }}>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>{isSpRole ? "Schedule Match Name" : "Schedule Match Name"}</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {scheduleName || (isSpRole ? "Optional" : "Not set")}
                  </div>
                </div>
                <div style={metadataCardStyle}>
                  <div style={statLabel}>Role</div>
                  <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                    {formatRoleLabel(role)}
                  </div>
                </div>
                {isSpRole ? (
                  <div style={metadataCardStyle}>
                    <div style={statLabel}>Portal Profile</div>
                    <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                      {asText(data?.sp_link?.status).toLowerCase() === "linked" ? "Ready" : "Needs coordinator review"}
                    </div>
                    <div style={{ marginTop: "6px", color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
                      Confirmed assignments and open shift offers appear in the SP portal when your simulation team connects your account.
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>SP Directory Link</div>
                      <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                        {asText(data?.sp_link?.status).toLowerCase() === "linked"
                          ? `Linked${asText(data?.sp_link?.sp_name) ? ` to ${asText(data?.sp_link?.sp_name)}` : ""}`
                          : "Not applicable"}
                      </div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Account State</div>
                      <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                        {isActive}
                      </div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Profile Storage</div>
                      <div style={{ marginTop: "4px", color: "#173b6c", fontWeight: 800 }}>
                        {data?.profile_available === false ? "Not available on this deployment" : "Ready"}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {!isSpRole ? (
            <div style={sectionStyle}>
              <button
                type="button"
                onClick={() => setShowAdvancedDetails((value) => !value)}
                style={{
                  ...secondaryButtonStyle,
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>Advanced account details</span>
                <span>{showAdvancedDetails ? "Hide" : "Show"}</span>
              </button>
              {showAdvancedDetails ? (
                loading ? (
                  <p style={{ margin: "12px 0 0", color: "#64748b", fontWeight: 700 }}>Loading internal details...</p>
                ) : (
                  <div style={{ ...metadataGridStyle, marginTop: "14px" }}>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>User ID</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{userId}</div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Profile ID</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{profileId}</div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Email</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>{email || "Unavailable"}</div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Created</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                        {formatTimestamp(data?.user?.created_at)}
                      </div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Last Sign-In</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                        {formatTimestamp(data?.user?.last_sign_in_at)}
                      </div>
                    </div>
                    <div style={metadataCardStyle}>
                      <div style={statLabel}>Email Confirmed</div>
                      <div style={{ marginTop: "4px", color: "#334155", fontWeight: 700 }}>
                        {formatTimestamp(data?.user?.email_confirmed_at)}
                      </div>
                    </div>
                  </div>
                )
              ) : (
                <p style={{ margin: "12px 0 0", color: "#64748b", lineHeight: 1.6 }}>
                  Internal account identifiers and timestamps are hidden by default to keep your profile page focused.
                </p>
              )}
            </div>
          ) : null}

          <div style={sectionStyle}>
            <h2 style={{ margin: 0, color: "#173b6c" }}>Account Actions</h2>
            <p style={{ margin: "8px 0 14px", color: "#64748b", lineHeight: 1.6 }}>
              Sign out when you are done or if you need to switch confidential member accounts.
            </p>
            <button
              type="button"
              style={{ ...secondaryButtonStyle, opacity: signingOut ? 0.7 : 1 }}
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
