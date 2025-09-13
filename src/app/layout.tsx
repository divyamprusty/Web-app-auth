import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthContextProvider } from "../contexts/AuthContext";
import FloatingExtensionIcon from "../components/FloatingExtensionIcon";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ChatBot Web App",
  description: "A modern chatbot web application with authentication and real-time chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthContextProvider>
          <div className="w-full h-screen overflow-hidden bg-gray-900">
            {children}
            <FloatingExtensionIcon />
          </div>
        </AuthContextProvider>
      </body>
    </html>
  );
}