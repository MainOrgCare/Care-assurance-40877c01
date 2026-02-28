import sys
from PyPDF2 import PdfReader

try:
    reader = PdfReader("/c:/Users/lewis/Downloads/examples/EMAR-1-3689_1765344478636.pdf")
    for i, page in enumerate(reader.pages):
        print(f"--- PAGE {i+1} ---")
        print(page.extract_text())
except Exception as e:
    # If the file path is a virtual path and we can't read it, we will fail
    print("Failed to read: " + str(e))
