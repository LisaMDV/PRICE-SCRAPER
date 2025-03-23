import csv
import re
import sys
import os


def parse_fraction_or_int(s):
    """ Converts fractions and mixed numbers to float. """
    if not isinstance(s, str):
        return None  # Non-string input cannot be parsed

    s = s.strip()
    if '-' in s and '/' in s:
        # e.g., '104-5/8' -> 104 + 5/8 = 104.625
        whole, frac = s.split('-')
        try:
            whole = float(whole)
            num, denom = frac.split('/')
            frac = float(num) / float(denom)
            return whole + frac
        except ValueError:
            return None
    elif '/' in s:
        # e.g., '5/4' -> 1.25
        try:
            num, denom = s.split('/')
            return float(num) / float(denom)
        except ValueError:
            return None
    else:
        try:
            return float(s)
        except ValueError:
            return None


def parse_dimensions(product_name):
    """ Extracts width, thickness, and length from the product name. """
    cleaned_name = clean_text(product_name)

    dimension_pattern = re.compile(
        r'(\d+(?:-\d+/\d+)?(?:\.\d+)?)\s*[xX]\s*'
        r'(\d+(?:-\d+/\d+)?(?:\.\d+)?)\s*[xX]\s*'
        r'(\d+(?:-\d+/\d+)?(?:\.\d+)?)'
    )

    match = dimension_pattern.search(cleaned_name)
    if match:
        dim1, dim2, length = match.groups()
        dim1, dim2, length = map(parse_fraction_or_int, [dim1, dim2, length])

        if dim1 is None or dim2 is None or length is None:
            return None

        # Ensure dim1 <= dim2 for consistent grouping
        if dim1 > dim2:
            dim1, dim2 = dim2, dim1

        return (dim1, dim2, length)
    else:
        return None


def sort_key(row):
    """ Sorting key for CSV rows based on parsed dimensions. """
    product_name = row.get("Product Name", "")
    dims = parse_dimensions(product_name)
    return dims if dims else (999999, 999999, 999999)


def clean_text(text):
    """ Cleans up product names by removing unwanted characters. """
    if not isinstance(text, str):
        return text

    text = re.sub(r'(?i)-ft', "'", text)
    text = re.sub(r'(?i)-inch', '', text)
    text = re.sub(r'(?i)\b inch\b', '', text)
    text = re.sub(r'(?i)/ each', '', text)
    text = re.sub(r'\s+', ' ', text).strip()

    return text


def reorder_and_clean_csv(input_path, debug=False):
    """ Reads, sorts, cleans, and writes the sorted CSV file. """
    if not os.path.exists(input_path):
        print(f"Error: File '{input_path}' not found.")
        return

    # Determine the output file path by replacing "Unsorted" with "Sorted"
    output_path = input_path.replace("Unsorted", "Sorted")

    try:
        with open(input_path, mode='r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        sorted_rows = sorted(rows, key=sort_key)

        desired_fieldnames = ["Product Name", "Price"]

        with open(output_path, mode='w', newline='', encoding='utf-8') as f_out:
            writer = csv.DictWriter(f_out, fieldnames=desired_fieldnames)
            writer.writeheader()
            for row in sorted_rows:
                cleaned_product_name = clean_text(row.get("Product Name", ""))
                cleaned_price = clean_text(row.get("Price", ""))

                if debug:
                    print(f"Original: {row.get('Product Name', '')} -> Cleaned: {cleaned_product_name}")
                    print(f"Original Price: {row.get('Price', '')} -> Cleaned Price: {cleaned_price}")
                    print("-" * 50)

                writer.writerow({"Product Name": cleaned_product_name, "Price": cleaned_price})

        print(f"Sorted file created: {output_path}")

    except Exception as e:
        print(f"An error occurred: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python sortProducts.py <input_csv_path>")
    else:
        reorder_and_clean_csv(sys.argv[1])
