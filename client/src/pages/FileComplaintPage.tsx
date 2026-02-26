import {
  ArrowRight,
  FileText,
  ImagePlus,
  IdCard,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Mic,
  Navigation
} from "lucide-react";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCategories, submitComplaint } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Category } from "../types";

type PreviewImage = { file: File; url: string };

export default function FileComplaintPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [form, setForm] = useState({
    categoryId: "",
    fullName: user?.name ?? "",
    email: user?.email ?? "",
    mobile: "",
    description: "",
    location: "",
    latitude: "",
    longitude: ""
  });

  const [images, setImages] = useState<PreviewImage[]>([]);

  useEffect(() => {
    void listCategories().then(setCategories);
  }, []);

  useEffect(() => {
    return () => {
      for (const image of images) {
        URL.revokeObjectURL(image.url);
      }
    };
  }, [images]);

  const steps = useMemo(
    () => [
      { label: "Details", icon: IdCard },
      { label: "Describe", icon: FileText },
      { label: "Photos", icon: ImagePlus },
      { label: "Location", icon: MapPin }
    ],
    []
  );

  function updateField<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onPickPhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const mapped = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setImages(mapped);
  }

  function validate() {
    if (!form.categoryId) return "Issue category is required";
    if (form.fullName.trim().length < 2) return "Full name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Valid email is required";
    if (!/^\d{10}$/.test(form.mobile)) return "Mobile number must be 10 digits";
    if (form.description.trim().length < 10) return "Description must be at least 10 characters";
    if (form.location.trim().length < 3) return "Location is required";
    return null;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessId(null);

    if (!token) {
      setError("Please login first to submit a complaint");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      const coordinates = await resolveCoordinates(form.location.trim(), form.latitude, form.longitude);
      const result = await submitComplaint(token, {
        categoryId: Number(form.categoryId),
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        mobile: form.mobile.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        photos: images.map((item) => item.file)
      });
      setSuccessId(result.complaint?.ticket_number ?? "Generated");
      setForm((prev) => ({
        ...prev,
        categoryId: "",
        mobile: "",
        description: "",
        location: "",
        latitude: "",
        longitude: ""
      }));
      setImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit complaint");
    } finally {
      setLoading(false);
    }
  }

  function useVoiceInput() {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setError("Voice input is not supported in this browser");
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsRecording(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      updateField("description", form.description ? `${form.description} ${transcript}` : transcript);
    };

    recognition.onerror = () => {
      setError("Unable to capture voice right now");
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  }

  function detectGps() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser");
      return;
    }
    setGpsLoading(true);
    setGpsMessage(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        updateField("latitude", position.coords.latitude.toFixed(6));
        updateField("longitude", position.coords.longitude.toFixed(6));

        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
          );
          const json = (await response.json()) as { display_name?: string; address?: Record<string, string> };
          const prettyAddress =
            json.display_name ??
            [
              json.address?.road,
              json.address?.suburb,
              json.address?.city || json.address?.town || json.address?.village,
              json.address?.state,
              json.address?.country
            ]
              .filter(Boolean)
              .join(", ");

          if (prettyAddress) {
            updateField("location", prettyAddress);
            setGpsMessage("Location captured. Edit below if needed.");
          } else {
            setError("Could not resolve place name from GPS");
          }
        } catch {
          setError("Could not fetch place name from GPS coordinates");
        }
        setGpsLoading(false);
      },
      () => {
        setError("Could not detect location");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function onCancel() {
    navigate("/dashboard");
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="text-center">
        <h1 className="text-4xl font-black text-nagar-blue sm:text-5xl">Report an Issue</h1>
        <p className="mx-auto mt-2 max-w-2xl text-lg text-slate-600 sm:text-xl">
          Describe the civic problem and we'll try to solve it.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-slate-700">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-200">
                <Icon size={20} />
                <span className="font-medium">{step.label}</span>
              </div>
              {idx < steps.length - 1 ? <ArrowRight className="hidden sm:block" size={18} /> : null}
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8">
        <Field label="What type of issue?">
          <select
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
            className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-lg outline-none focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
            required
          >
            <option value="">Choose a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Enter your name">
          <input
            value={form.fullName}
            onChange={(event) => updateField("fullName", event.target.value)}
            className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-lg outline-none focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
            placeholder="Enter your full name"
            required
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-lg outline-none focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
            placeholder="Enter your email"
            required
          />
        </Field>

        <Field label="Mobile Number">
          <input
            value={form.mobile}
            onChange={(event) => updateField("mobile", event.target.value.replace(/\D/g, "").slice(0, 10))}
            className="h-14 w-full rounded-2xl border border-slate-300 px-4 text-lg outline-none focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
            placeholder="Enter mobile number"
            inputMode="numeric"
            maxLength={10}
            required
          />
        </Field>

        <Field label="Describe the issue">
          <textarea
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            className="min-h-32 w-full rounded-2xl border border-slate-300 px-4 py-3 text-lg outline-none focus:border-nagar-blue focus:ring-2 focus:ring-blue-100"
            placeholder="Type or use the mic to speak your description..."
            required
          />
          <button
            type="button"
            onClick={useVoiceInput}
            className="mt-3 inline-flex items-center gap-2 rounded-2xl border-2 border-nagar-blue px-5 py-3 text-lg font-semibold text-nagar-blue"
          >
            <Mic size={18} /> {isRecording ? "Listening..." : "Use voice"}
          </button>
          <p className="mt-2 text-slate-600">Type or tap the mic to speak. You can edit the text after.</p>
        </Field>

        <Field label="Upload Photos (Optional)">
          <input
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={onPickPhotos}
            className="block w-full rounded-2xl border border-slate-300 p-3 text-base"
          />
          <p className="mt-2 text-slate-600">You can select multiple photos or use camera.</p>
          {images.length ? (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((image) => (
                <img key={image.url} src={image.url} alt={image.file.name} className="h-20 w-full rounded-xl object-cover" />
              ))}
            </div>
          ) : null}
        </Field>

        <Field label="Where is it?">
          <div className="flex rounded-2xl border border-slate-300">
            <input
              value={form.location}
              onChange={(event) => updateField("location", event.target.value)}
              className="h-14 w-full rounded-l-2xl px-4 text-lg outline-none"
              placeholder="Type address or use GPS to detect"
              required
            />
            <button
              type="button"
              onClick={detectGps}
              className="grid h-14 w-16 place-content-center rounded-r-2xl border-l border-slate-300 bg-slate-50 text-slate-700"
            >
              {gpsLoading ? <LoaderCircle className="animate-spin" size={20} /> : <LocateFixed size={20} />}
            </button>
          </div>
          {gpsMessage ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">{gpsMessage}</p> : null}
          <p className="mt-2 text-slate-600">Type your address or use GPS. You can edit the result if needed.</p>
        </Field>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{error}</p> : null}
        {successId ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">
            Complaint submitted successfully. Complaint ID: <strong>{successId}</strong>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-nagar-blue py-4 text-xl font-bold text-white shadow-lg shadow-blue-200 disabled:opacity-70"
        >
          {loading ? <LoaderCircle className="animate-spin" size={20} /> : <Navigation size={18} />}
          {loading ? "Submitting..." : "Submit Report"}
        </button>

        <button type="button" onClick={onCancel} className="mt-3 w-full py-3 text-lg font-semibold text-slate-500">
          Cancel
        </button>
      </form>
    </main>
  );
}

async function resolveCoordinates(location: string, latitude: string, longitude: string) {
  if (latitude && longitude) {
    return { latitude: Number(latitude), longitude: Number(longitude) };
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`
    );
    const json = (await response.json()) as Array<{ lat: string; lon: string }>;
    const first = json[0];
    if (!first) {
      return { latitude: undefined, longitude: undefined };
    }
    return {
      latitude: Number(first.lat),
      longitude: Number(first.lon)
    };
  } catch {
    return { latitude: undefined, longitude: undefined };
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label className="mb-2 block text-2xl font-bold text-[#0A3F70] sm:text-xl">{label}</label>
      {children}
    </div>
  );
}
