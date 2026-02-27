import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/access";
import {
  deleteManagedAvatarByUrl,
  getAvatarConstraints,
  saveAvatarFile,
} from "@/lib/avatar-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const rawAvatar = formData.get("avatar");
  if (!(rawAvatar instanceof File)) {
    return NextResponse.json({ error: "Avatar file is required." }, { status: 400 });
  }

  const constraints = getAvatarConstraints();
  if (rawAvatar.size > constraints.maxSizeBytes) {
    return NextResponse.json({ error: "Avatar file exceeds the 2MB limit." }, { status: 400 });
  }

  if (!constraints.allowedMimeTypes.includes(rawAvatar.type)) {
    return NextResponse.json({ error: "Avatar must be JPG, PNG, or WEBP." }, { status: 400 });
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      avatarUrl: true,
    },
  });

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let newAvatarUrl: string | null = null;
  try {
    newAvatarUrl = await saveAvatarFile(currentUser.id, rawAvatar);

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        avatarUrl: newAvatarUrl,
      },
      select: {
        avatarUrl: true,
      },
    });

    await deleteManagedAvatarByUrl(currentUser.avatarUrl);

    return NextResponse.json(
      {
        message: "Avatar updated successfully.",
        avatarUrl: updated.avatarUrl,
      },
      { status: 200 },
    );
  } catch (error) {
    await deleteManagedAvatarByUrl(newAvatarUrl);
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to upload avatar.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      avatarUrl: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      avatarUrl: null,
    },
  });

  await deleteManagedAvatarByUrl(user.avatarUrl);

  return NextResponse.json(
    {
      message: "Avatar removed.",
      avatarUrl: null,
    },
    { status: 200 },
  );
}
