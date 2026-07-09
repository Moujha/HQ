import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      offset={{
        top: "calc(env(safe-area-inset-top) + 0.75rem)",
        left: "calc(env(safe-area-inset-left) + 0.75rem)",
        right: "calc(env(safe-area-inset-right) + 0.75rem)",
      }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top) + 0.75rem)",
        left: "calc(env(safe-area-inset-left) + 0.75rem)",
        right: "calc(env(safe-area-inset-right) + 0.75rem)",
      }}
      toastOptions={{
        className: "mx-auto w-full max-w-[calc(100vw-1.5rem)]",
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
