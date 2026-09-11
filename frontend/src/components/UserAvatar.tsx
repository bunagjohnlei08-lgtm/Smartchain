import { useState } from 'react';
import { userInitials } from '../lib/authUser';

interface UserAvatarProps {
  name: string;
  photoUrl?: string | null;
  className: string;
  imageClassName?: string;
}

export default function UserAvatar({ name, photoUrl, className, imageClassName = 'h-full w-full object-cover' }: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(photoUrl) && failedUrl !== photoUrl;

  return (
    <span className={`overflow-hidden ${className}`}>
      {showImage ? (
        <img
          src={photoUrl ?? undefined}
          alt={`${name}'s profile`}
          className={imageClassName}
          onError={() => setFailedUrl(photoUrl ?? null)}
        />
      ) : userInitials(name)}
    </span>
  );
}
