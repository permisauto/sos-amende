// Type declarations for modules without types
declare module 'next-auth';
declare module 'next-auth/providers/resend';
declare module 'next-auth/providers/credentials';
declare module 'next-auth/react';
declare module 'lucide-react';
declare module '@aws-sdk/client-s3';
declare module '@aws-sdk/s3-request-presigner';
declare module 'pdf-parse';
declare module 'pdfjs-dist';
declare module 'tesseract.js';
declare module 'qrcode.react';
declare module 'react-signature-canvas';
declare module 'node-mocks-http';

// Jest globals
declare namespace jest {
  interface Mock<T = any> {
    new (...args: any[]): T;
    (...args: any[]): T;
    mockResolvedValue(value: any): this;
    mockRejectedValue(value: any): this;
    mockReturnValue(value: any): this;
    mockImplementation(fn: Function): this;
  }
  interface MockedFunction<T extends Function> extends Mock<ReturnType<T>> {}
}